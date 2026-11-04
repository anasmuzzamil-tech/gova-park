import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, gt, lt, ne, inArray, or, isNull, desc, count, sql } from "drizzle-orm";
import { createRouter, publicQuery, authedQuery, adminQuery, ownerQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { listings, reservations, communityReports, reportVotes, proximityAlerts, files, favorites, users, messages, notifications, parkingObservations, ownerVerifications, companySettings, disputes, predictionEvaluations, adminAuditLogs, refundRequests, ownerVerificationDocuments, pushDevices, parkingSessions } from "@db/schema";
import { calculatePrice, overlaps } from "@contracts/pricing";
import { meterCostCents } from "@contracts/meter";
import { listingStatus, reportStatus } from "@contracts/parking-status";
import { checkBooking } from "@contracts/booking";
import { validateListing } from "@contracts/listing-validation";
import { matchesFilters, isOpenAt, parseJson, type Schedule, type Period, type Slot } from "@contracts/parking-search";
import { storage } from "./lib/storage";
import { isDemoMode, demoListings, demoReports, demoFavoriteIds, demoFavoriteListings, demoToggleFavorite, demoCreateReservation, demoMyReservations, demoCancelReservation, demoCreateReport, demoVote, demoStopReport, demoUpdateDeparture, demoMeterCurrent, demoMeterStart, demoMeterStop, demoMeterHistory, demoBookedSlots } from "./demo";

const revealedStatuses = ["confirmed", "in_progress", "completed", "refund_pending", "refunded", "dispute"] as const;

async function withPhotoUrls<T extends { photos: string }>(rows: T[]) {
  const storedKeys = [...new Set(rows.flatMap((row) => JSON.parse(row.photos) as string[]).filter((photo) => !photo.startsWith("/parking/")))];
  const urls = storedKeys.length ? (await storage.getPresignedUrls({ keys: storedKeys })).urls : [];
  const urlByKey = new Map(urls.map((item) => [item.key, item.url]));
  return rows.map((row) => ({
    ...row,
    photos: (JSON.parse(row.photos) as string[]).map((photo) => photo.startsWith("/parking/") ? photo : urlByKey.get(photo) ?? ""),
  }));
}

function publicListing<T extends { exactAddress: string; accessInstructions: string }>(listing: T) {
  const { exactAddress: _exact, accessInstructions: _access, moderationNote: _moderation, ...safe } = listing;
  return safe;
}

function assertBookable(listing: typeof listings.$inferSelect, startAt: Date, endAt: Date, activeBookings: Slot[] = []) {
  const check = checkBooking(listing, startAt, endAt, activeBookings);
  if (!check.ok) throw new TRPCError({ code: check.code, message: check.message });
}

const reservationInput = z.object({ listingId: z.number().int().positive(), startAt: z.date(), endAt: z.date() });
const reservationCreateInput = reservationInput.extend({ vehiclePlate: z.string().trim().max(12).optional().transform((value) => value ? value.toUpperCase().replace(/[^A-Z0-9-]/g, "") : null) });
const availabilityInput = z.object({ days: z.array(z.number().int().min(0).max(6)), start: z.string(), end: z.string() });
const blockedInput = z.array(z.object({ start: z.string(), end: z.string() }));

function observationCell(latitude: number, longitude: number) {
  // Environ 250 m par cellule. Coordonnées brutes conservées uniquement dans
  // l'observation agrégée, sans identité utilisateur.
  const latCell = Math.round(latitude * 450) / 450;
  const lngCell = Math.round(longitude * 450) / 450;
  return { cellKey: `${latCell.toFixed(4)}:${lngCell.toFixed(4)}`, latitude: latCell, longitude: lngCell };
}
async function recordParkingObservation(input: { latitude: number; longitude: number; kind: "free_confirmed" | "occupied_confirmed" | "departure" | "contradiction"; reportId?: number }) {
  const now = new Date(); const cell = observationCell(input.latitude, input.longitude);
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.find(p => p.type === "weekday")?.value ?? "Sun");
  const hour = Number(parts.find(p => p.type === "hour")?.value ?? "0");
  await getDb().insert(parkingObservations).values({ ...cell, kind: input.kind, weekday, hour, reportId: input.reportId });
}

async function writeAdminAudit(input: { actorId: number; action: string; targetType: string; targetId?: string | number; details?: unknown }) {
  await getDb().insert(adminAuditLogs).values({ actorId: input.actorId, action: input.action, targetType: input.targetType, targetId: input.targetId == null ? null : String(input.targetId), details: input.details == null ? null : JSON.stringify(input.details).slice(0, 6000) });
}

export const govaparkRouter = createRouter({
  devices: createRouter({
    register: authedQuery.input(z.object({ token: z.string().trim().min(20).max(512), platform: z.enum(["ios", "android"]), deviceId: z.string().trim().max(160).optional() })).mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [existing] = await db.select().from(pushDevices).where(eq(pushDevices.token, input.token)).limit(1);
      if (existing) {
        await db.update(pushDevices).set({ userId: ctx.user.id, platform: input.platform, deviceId: input.deviceId ?? null, isActive: true, lastSeenAt: new Date() }).where(eq(pushDevices.id, existing.id));
      } else {
        await db.insert(pushDevices).values({ userId: ctx.user.id, token: input.token, platform: input.platform, deviceId: input.deviceId ?? null, isActive: true, lastSeenAt: new Date() });
      }
      return { success: true };
    }),
    deactivate: authedQuery.input(z.object({ token: z.string().trim().min(20).max(512) })).mutation(async ({ ctx, input }) => {
      await getDb().update(pushDevices).set({ isActive: false }).where(and(eq(pushDevices.userId, ctx.user.id), eq(pushDevices.token, input.token)));
      return { success: true };
    }),
  }),
  listings: createRouter({
    list: publicQuery.query(async () => {
      if (isDemoMode) return demoListings();
      const db = getDb();
      const rows = await db.select().from(listings).where(eq(listings.status, "published"));
      const now = new Date();
      const horizon = new Date(now.getTime() + 60 * 60 * 1000);
      const activeBookings = await db.select({ listingId: reservations.listingId }).from(reservations).where(and(
        or(
          inArray(reservations.status, ["confirmed", "in_progress"]),
          and(eq(reservations.status, "payment_pending"), gt(reservations.expiresAt, now)),
        ),
        lt(reservations.startAt, horizon), gt(reservations.endAt, now),
      ));
      const occupiedIds = new Set(activeBookings.map((booking) => Number(booking.listingId)));
      const enriched = rows.map((row) => {
        const schedule = parseJson<Schedule>(row.availability, { days: [], start: "00:00", end: "00:00" });
        const openNow = isOpenAt(schedule, [], now); // heure de Paris, pas celle du serveur
        const blockedNow = parseJson<Period[]>(row.blocked, []).some((period) => new Date(period.start) < horizon && new Date(period.end) > now);
        const parkingStatus = listingStatus({ openNow, blockedNow, booked: occupiedIds.has(Number(row.id)) }, now);
        const currentAvailability: "available" | "unavailable" = parkingStatus.availability === "available" ? "available" : "unavailable";
        return { ...row, currentAvailability, parkingStatus };
      });
      return (await withPhotoUrls(enriched)).map(publicListing);
    }),
    search: publicQuery.input(z.object({
      bbox: z.object({ south: z.number().min(-90).max(90), north: z.number().min(-90).max(90), west: z.number().min(-180).max(180), east: z.number().min(-180).max(180) }),
      limit: z.number().int().min(1).max(300).default(200),
      category: z.enum(["public", "private", "collective"]).default("private"),
      maxHourlyCents: z.number().int().min(0).optional(), placeType: z.enum(["garage", "residence", "entreprise", "parking"]).optional(),
      covered: z.boolean().optional(), accessible: z.boolean().optional(), priceMode: z.enum(["free", "paid"]).optional(),
      minLengthM: z.number().min(0).max(20).optional(), minWidthM: z.number().min(0).max(5).optional(), minHeightCm: z.number().int().min(0).max(600).optional(),
      onlyAvailable: z.boolean().optional(), from: z.date().optional(), to: z.date().optional(),
    })).query(async ({ input }) => {
      // Catégories jamais mélangées : cette requête ne renvoie que des places privées à louer.
      // Le stationnement public et les parkings collectifs n'ont pas encore de source de données branchée (voir docs/DONNEES.md).
      if (input.category !== "private") return { items: [], truncated: false, category: input.category, note: "Aucune donnée réelle n'est encore branchée pour cette catégorie : voir docs/DONNEES.md." };
      if (input.bbox.south > input.bbox.north) throw new TRPCError({ code: "BAD_REQUEST", message: "Zone invalide." });
      const { limit, category: _category, ...filters } = input;
      const now = new Date();
      let rows: Array<ReturnType<typeof demoListings>[number]>;
      const slotsByListing = new Map<number, Slot[]>();
      if (isDemoMode) {
        rows = demoListings();
        for (const slot of demoBookedSlots()) slotsByListing.set(slot.listingId, [...(slotsByListing.get(slot.listingId) ?? []), slot]);
      } else {
        const db = getDb();
        const conditions = [eq(listings.status, "published"), gt(listings.latitude, input.bbox.south - 1e-9), lt(listings.latitude, input.bbox.north + 1e-9), gt(listings.longitude, input.bbox.west - 1e-9), lt(listings.longitude, input.bbox.east + 1e-9)];
        if (input.maxHourlyCents != null) conditions.push(sql`${listings.hourlyCents} <= ${input.maxHourlyCents}`);
        if (input.placeType) conditions.push(eq(listings.placeType, input.placeType));
        if (input.covered != null) conditions.push(eq(listings.covered, input.covered));
        if (input.accessible) conditions.push(eq(listings.accessible, true));
        if (input.minHeightCm != null) conditions.push(sql`${listings.heightCm} >= ${input.minHeightCm}`);
        rows = (await db.select().from(listings).where(and(...conditions)).limit(limit * 3)) as unknown as typeof rows;
        const ids = rows.map((r) => Number(r.id));
        const bookings = ids.length ? await db.select({ listingId: reservations.listingId, startAt: reservations.startAt, endAt: reservations.endAt }).from(reservations).where(and(
          inArray(reservations.listingId, ids),
          or(inArray(reservations.status, ["confirmed", "in_progress"]), and(eq(reservations.status, "payment_pending"), gt(reservations.expiresAt, now))),
          gt(reservations.endAt, now),
        )) : [];
        for (const b of bookings) slotsByListing.set(Number(b.listingId), [...(slotsByListing.get(Number(b.listingId)) ?? []), { startAt: b.startAt, endAt: b.endAt }]);
      }
      const horizon = new Date(now.getTime() + 60 * 60 * 1000);
      const enriched = rows.map((row) => {
        if (isDemoMode) return row;
        const schedule = parseJson<Schedule>(row.availability, { days: [], start: "00:00", end: "00:00" });
        const booked = (slotsByListing.get(Number(row.id)) ?? []).some((s) => s.startAt < horizon && s.endAt > now);
        const blockedNow = parseJson<Period[]>(row.blocked, []).some((p) => new Date(p.start) < horizon && new Date(p.end) > now);
        const parkingStatus = listingStatus({ openNow: isOpenAt(schedule, [], now), blockedNow, booked }, now);
        return { ...row, parkingStatus, currentAvailability: (parkingStatus.availability === "available" ? "available" : "unavailable") as "available" | "unavailable" };
      });
      const matching = enriched.filter((row) => matchesFilters({ ...row, accessible: row.accessible }, filters, slotsByListing.get(Number(row.id)) ?? []));
      const truncated = matching.length > limit;
      const items = isDemoMode ? matching.slice(0, limit) : await withPhotoUrls(matching.slice(0, limit));
      return { items: items.map(publicListing), truncated, category: "private" as const, note: null };
    }),
    byId: publicQuery.input(z.object({ id: z.number().int().positive() })).query(async ({ input }) => {
      if (isDemoMode) { const found = demoListings().find((item) => item.id === input.id); if (!found) throw new TRPCError({ code: "NOT_FOUND", message: "Annonce introuvable." }); return found; }
      const [row] = await getDb().select().from(listings).where(and(eq(listings.id, input.id), eq(listings.status, "published"))).limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Annonce introuvable." });
      const [withPhotos] = await withPhotoUrls([row]);
      const now = new Date();
      const horizon = new Date(now.getTime() + 60 * 60 * 1000);
      const bookings = await getDb().select({ startAt: reservations.startAt, endAt: reservations.endAt }).from(reservations).where(and(
        eq(reservations.listingId, row.id),
        or(inArray(reservations.status, ["confirmed", "in_progress"]), and(eq(reservations.status, "payment_pending"), gt(reservations.expiresAt, now))),
        lt(reservations.startAt, horizon), gt(reservations.endAt, now),
      ));
      const schedule = parseJson<Schedule>(row.availability, { days: [], start: "00:00", end: "00:00" });
      const blockedNow = parseJson<Period[]>(row.blocked, []).some((p) => new Date(p.start) < horizon && new Date(p.end) > now);
      const parkingStatus = listingStatus({ openNow: isOpenAt(schedule, [], now), blockedNow, booked: bookings.length > 0 }, now);
      return { ...publicListing(withPhotos), parkingStatus };
    }),
    quote: publicQuery.input(reservationInput).query(async ({ input }) => {
      if (isDemoMode) { const found = demoListings().find((item) => item.id === input.listingId); if (!found) throw new TRPCError({ code: "NOT_FOUND" }); return calculatePrice({ ...input, ...found, commissionBps: 1200 }); }
      const [listing] = await getDb().select().from(listings).where(eq(listings.id, input.listingId)).limit(1);
      if (!listing) throw new TRPCError({ code: "NOT_FOUND" });
      assertBookable(listing, input.startAt, input.endAt);
      const [settings] = await getDb().select().from(companySettings).where(eq(companySettings.id, 1)).limit(1);
      return calculatePrice({ ...input, ...listing, commissionBps: settings?.commissionBps ?? 1200 });
    }),
    // Vérification de disponibilité d'un créneau (lecture seule, mêmes règles que la création : checkBooking). Le message vient toujours du serveur, jamais d'une valeur supposée.
    checkSlot: publicQuery.input(reservationInput).query(async ({ input }) => {
      if (isDemoMode) {
        const found = demoListings().find((item) => item.id === input.listingId);
        if (!found) throw new TRPCError({ code: "NOT_FOUND", message: "Annonce introuvable." });
        const check = checkBooking(found, input.startAt, input.endAt, demoBookedSlots(found.id));
        return check.ok ? { available: true as const, message: null } : { available: false as const, message: check.message };
      }
      const [listing] = await getDb().select().from(listings).where(eq(listings.id, input.listingId)).limit(1);
      if (!listing) throw new TRPCError({ code: "NOT_FOUND", message: "Annonce introuvable." });
      const taken = await getDb().select({ startAt: reservations.startAt, endAt: reservations.endAt }).from(reservations).where(and(
        eq(reservations.listingId, listing.id),
        or(inArray(reservations.status, ["confirmed", "in_progress"]), and(eq(reservations.status, "payment_pending"), gt(reservations.expiresAt, new Date()))),
        lt(reservations.startAt, input.endAt), gt(reservations.endAt, input.startAt),
      ));
      const check = checkBooking(listing, input.startAt, input.endAt, taken);
      return check.ok ? { available: true as const, message: null } : { available: false as const, message: check.message };
    }),
    mine: ownerQuery.query(async ({ ctx }) => {
      const rows = await getDb().select().from(listings).where(eq(listings.ownerId, ctx.user.id)).orderBy(desc(listings.createdAt));
      return withPhotoUrls(rows);
    }),
    create: ownerQuery.input(z.object({
      title: z.string().min(4).max(180), description: z.string().min(20).max(5000),
      address: z.string().min(5).max(255), approxAddress: z.string().min(3).max(255),
      accessInstructions: z.string().min(5).max(2000), latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180),
      placeType: z.enum(["garage", "residence", "entreprise", "parking"]), covered: z.boolean(), accessible: z.boolean().default(false),
      lengthM: z.number().positive(), widthM: z.number().positive(), heightCm: z.number().int().positive(),
      hourlyCents: z.number().int().positive(), dailyCents: z.number().int().positive(), weeklyCents: z.number().int().positive(),
      bookingMode: z.enum(["instant", "validation"]), photos: z.array(z.string().max(600)).min(1).max(8), mainPhoto: z.number().int().min(0),
      availability: availabilityInput, blocked: blockedInput, submit: z.boolean(),
    })).mutation(async ({ ctx, input }) => {
      const problems = validateListing({ title: input.title, description: input.description, address: input.address, approxAddress: input.approxAddress, accessInstructions: input.accessInstructions, latitude: input.latitude, longitude: input.longitude, lengthM: input.lengthM, widthM: input.widthM, heightCm: input.heightCm, hourlyCents: input.hourlyCents, dailyCents: input.dailyCents, weeklyCents: input.weeklyCents, photoCount: input.photos.length, availability: input.availability });
      if (problems.length) throw new TRPCError({ code: "BAD_REQUEST", message: problems.join(" ") });
      const [ownerAccount] = await getDb().select({ ownerVerificationStatus: users.ownerVerificationStatus }).from(users).where(eq(users.id, ctx.user.id)).limit(1);
      if (ctx.user.role !== "admin" && ownerAccount?.ownerVerificationStatus !== "verified") throw new TRPCError({ code: "FORBIDDEN", message: "Votre compte propriétaire doit être validé par GOVAPARK avant de publier une annonce." });
      if (input.photos.some((key) => !key.startsWith("/parking/"))) {
        const owned = await getDb().select({ key: files.key }).from(files).where(and(eq(files.ownerId, ctx.user.id), inArray(files.key, input.photos)));
        if (owned.length !== new Set(input.photos).size) throw new TRPCError({ code: "FORBIDDEN", message: "Une photo ne vous appartient pas." });
      }
      const [created] = await getDb().insert(listings).values({
        ownerId: ctx.user.id, title: input.title, description: input.description,
        approxAddress: input.approxAddress, exactAddress: input.address, accessInstructions: input.accessInstructions,
        latitude: input.latitude, longitude: input.longitude, placeType: input.placeType, covered: input.covered, accessible: input.accessible,
        lengthM: input.lengthM, widthM: input.widthM, heightCm: input.heightCm,
        hourlyCents: input.hourlyCents, dailyCents: input.dailyCents, weeklyCents: input.weeklyCents,
        bookingMode: input.bookingMode, status: input.submit ? "pending" : "draft",
        photos: JSON.stringify(input.photos), mainPhoto: input.mainPhoto,
        availability: JSON.stringify(input.availability), blocked: JSON.stringify(input.blocked),
      }).$returningId();
      return { id: created.id, status: input.submit ? "pending" : "draft" };
    }),
    setStatus: ownerQuery.input(z.object({ id: z.number().int(), status: z.enum(["draft", "pending", "suspended", "archived"]) })).mutation(async ({ ctx, input }) => {
      await getDb().update(listings).set({ status: input.status }).where(and(eq(listings.id, input.id), eq(listings.ownerId, ctx.user.id)));
      return { ok: true };
    }),
    setCalendar: ownerQuery.input(z.object({ id: z.number().int(), availability: availabilityInput, blocked: blockedInput })).mutation(async ({ ctx, input }) => {
      await getDb().update(listings).set({ availability: JSON.stringify(input.availability), blocked: JSON.stringify(input.blocked) })
        .where(and(eq(listings.id, input.id), eq(listings.ownerId, ctx.user.id)));
      return { ok: true };
    }),
  }),


  favorites: createRouter({
    list: authedQuery.query(async ({ ctx }) => {
      if (isDemoMode) return demoFavoriteListings();
      const rows = await getDb().select({ listing: listings }).from(favorites)
        .innerJoin(listings, eq(favorites.listingId, listings.id))
        .where(and(eq(favorites.userId, ctx.user.id), eq(listings.status, "published")))
        .orderBy(desc(favorites.createdAt));
      return (await withPhotoUrls(rows.map((r) => r.listing))).map(publicListing);
    }),
    ids: authedQuery.query(async ({ ctx }) => {
      if (isDemoMode) return demoFavoriteIds();
      const rows = await getDb().select({ listingId: favorites.listingId }).from(favorites).where(eq(favorites.userId, ctx.user.id));
      return rows.map((r) => Number(r.listingId));
    }),
    toggle: authedQuery.input(z.object({ listingId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      if (isDemoMode) return demoToggleFavorite(input.listingId);
      const db = getDb();
      const [existing] = await db.select().from(favorites).where(and(eq(favorites.userId, ctx.user.id), eq(favorites.listingId, input.listingId))).limit(1);
      if (existing) { await db.delete(favorites).where(eq(favorites.id, existing.id)); return { favorite: false }; }
      await db.insert(favorites).values({ userId: ctx.user.id, listingId: input.listingId });
      return { favorite: true };
    }),
  }),
  reservations: createRouter({
    create: authedQuery.input(reservationCreateInput).mutation(async ({ ctx, input }) => {
      if (isDemoMode) { try { return demoCreateReservation(input); } catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: e instanceof Error ? e.message : "Réservation impossible." }); } }
      const db = getDb();
      return db.transaction(async (tx) => {
        const [listing] = await tx.select().from(listings).where(eq(listings.id, input.listingId)).for("update").limit(1);
        if (!listing) throw new TRPCError({ code: "NOT_FOUND" });
        if (listing.ownerId === ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Vous ne pouvez pas réserver votre propre place." });
        // Verrou de ligne sur l'annonce (for update) + recherche des créneaux déjà pris : deux utilisateurs ne peuvent pas réserver des créneaux qui se recoupent.
        const taken = await tx.select({ startAt: reservations.startAt, endAt: reservations.endAt }).from(reservations).where(and(
          eq(reservations.listingId, listing.id),
          or(
            inArray(reservations.status, ["confirmed", "in_progress"]),
            and(eq(reservations.status, "payment_pending"), gt(reservations.expiresAt, new Date())),
          ),
          lt(reservations.startAt, input.endAt), gt(reservations.endAt, input.startAt),
        ));
        assertBookable(listing, input.startAt, input.endAt, taken);
        const [settings] = await tx.select().from(companySettings).where(eq(companySettings.id, 1)).limit(1);
        const { startedHours: _hours, ...price } = calculatePrice({ ...input, ...listing, commissionBps: settings?.commissionBps ?? 1200 });
        const [created] = await tx.insert(reservations).values({
          ...input, userId: ctx.user.id, ...price,
          status: listing.bookingMode === "instant" ? "payment_pending" : "pending",
          expiresAt: new Date(Date.now() + (listing.bookingMode === "validation" ? 24 * 3600000 : 30 * 60 * 1000)),
        }).$returningId();
        if (listing.ownerId) await tx.insert(notifications).values({ userId: Number(listing.ownerId), title: "Nouvelle demande de réservation", body: `Une demande a été créée pour « ${listing.title} ».`, kind: "reservation", reservationId: created.id });
        return { id: created.id, mode: listing.bookingMode };
      });
    }),
    pay: authedQuery.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => {
      const [reservation] = await getDb().select().from(reservations)
        .where(and(eq(reservations.id, input.id), eq(reservations.userId, ctx.user.id))).limit(1);
      if (!reservation) throw new TRPCError({ code: "NOT_FOUND", message: "Réservation introuvable." });
      if (reservation.status !== "payment_pending") throw new TRPCError({ code: "BAD_REQUEST", message: "Cette réservation n’attend pas de paiement." });
      // Safety: never mark a booking as paid/confirmed without a verified payment-provider webhook.
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Le paiement sécurisé n’est pas encore activé. Aucun débit n’a été effectué et la réservation n’est pas confirmée." });
    }),
    requestRefund: authedQuery.input(z.object({ reservationId: z.number().int().positive(), reason: z.string().trim().min(5).max(1000) })).mutation(async ({ ctx, input }) => {
      const [row] = await getDb().select().from(reservations).where(and(eq(reservations.id, input.reservationId), eq(reservations.userId, ctx.user.id))).limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Réservation introuvable." });
      if (!["confirmed", "completed", "refund_pending"].includes(row.status)) throw new TRPCError({ code: "BAD_REQUEST", message: "Cette réservation ne peut pas faire l'objet d'une demande de remboursement." });
      await getDb().insert(refundRequests).values({ reservationId: row.id, requestedBy: ctx.user.id, reason: input.reason, previousStatus: row.status === "refund_pending" ? "confirmed" : row.status, amountCents: row.totalCents, status: "requested" }).onDuplicateKeyUpdate({ set: { reason: input.reason, status: "requested", updatedAt: new Date() } });
      await getDb().update(reservations).set({ status: "refund_pending" }).where(eq(reservations.id, row.id));
      const admins = await getDb().select({ id: users.id }).from(users).where(eq(users.role, "admin"));
      if (admins.length) await getDb().insert(notifications).values(admins.map(a => ({ userId: a.id, title: "Nouvelle demande de remboursement", body: `Demande concernant la réservation #${row.id}.`, kind: "refund", reservationId: row.id })));
      return { ok: true, status: "requested", paymentProviderConnected: false, message: "Demande enregistrée. Le remboursement devra être traité après activation ou via le prestataire de paiement externe." };
    }),
    mine: authedQuery.query(async ({ ctx }) => {
      if (isDemoMode) return demoMyReservations();
      const rows = await getDb().select({ reservation: reservations, listing: listings }).from(reservations)
        .innerJoin(listings, eq(reservations.listingId, listings.id)).where(eq(reservations.userId, ctx.user.id)).orderBy(desc(reservations.startAt));
      const hydrated = await withPhotoUrls(rows.map((row) => row.listing));
      return rows.map((row, index) => ({
        ...row.reservation,
        listing: revealedStatuses.includes(row.reservation.status as typeof revealedStatuses[number])
          ? hydrated[index] : publicListing(hydrated[index]),
      }));
    }),
    cancel: authedQuery.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => {
      if (isDemoMode) { try { return demoCancelReservation(input.id); } catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: e instanceof Error ? e.message : "Annulation impossible." }); } }
      const [row] = await getDb().select().from(reservations).where(and(eq(reservations.id, input.id), eq(reservations.userId, ctx.user.id))).limit(1);
      if (!row || !["pending", "payment_pending", "confirmed"].includes(row.status)) throw new TRPCError({ code: "BAD_REQUEST", message: "Cette réservation ne peut plus être annulée." });
      const status = row.status === "confirmed" ? "refund_pending" : "cancelled";
      await getDb().update(reservations).set({ status }).where(eq(reservations.id, row.id));
      if (status === "refund_pending") {
        await getDb().insert(refundRequests).values({ reservationId: row.id, requestedBy: ctx.user.id, reason: "Demande de remboursement liée à l’annulation de la réservation.", previousStatus: "confirmed", amountCents: row.totalCents, status: "requested" }).onDuplicateKeyUpdate({ set: { status: "requested", updatedAt: new Date() } });
        const admins = await getDb().select({ id: users.id }).from(users).where(eq(users.role, "admin"));
        if (admins.length) await getDb().insert(notifications).values(admins.map(a => ({ userId: a.id, title: "Annulation avec remboursement à examiner", body: `La réservation #${row.id} a été annulée et nécessite un examen du remboursement.`, kind: "refund", reservationId: row.id })));
      }
      return { status };
    }),
    markDispute: authedQuery.input(z.object({ id: z.number().int(), reason: z.string().trim().min(5).max(1000).default("Demande d’examen de réservation") })).mutation(async ({ ctx, input }) => {
      const [reservation] = await getDb().select().from(reservations).where(and(eq(reservations.id, input.id), eq(reservations.userId, ctx.user.id))).limit(1);
      if (!reservation) throw new TRPCError({ code: "NOT_FOUND", message: "Réservation introuvable." });
      await getDb().update(reservations).set({ status: "dispute" }).where(eq(reservations.id, input.id));
      await getDb().insert(disputes).values({ reservationId: input.id, openedBy: ctx.user.id, reason: input.reason }).onDuplicateKeyUpdate({ set: { reason: input.reason, status: "open", updatedAt: new Date() } });
      return { ok: true };
    }),
  }),

  meter: createRouter({
    // Compteur de stationnement. L'heure de depart est enregistree cote serveur : le compteur reste
    // coherent apres actualisation ou reconnexion. serverNow evite les ecarts d'horloge du telephone.
    current: authedQuery.query(async ({ ctx }) => {
      if (isDemoMode) return { session: demoMeterCurrent(), serverNow: new Date() };
      const [session] = await getDb().select().from(parkingSessions).where(and(eq(parkingSessions.userId, ctx.user.id), isNull(parkingSessions.endedAt))).orderBy(desc(parkingSessions.startedAt)).limit(1);
      return { session: session ?? null, serverNow: new Date() };
    }),
    start: authedQuery.input(z.object({
      label: z.string().trim().min(1).max(160),
      address: z.string().trim().max(255).optional(),
      latitude: z.number().min(-90).max(90).optional(),
      longitude: z.number().min(-180).max(180).optional(),
      hourlyCents: z.number().int().min(0).max(10000).optional(),
    })).mutation(async ({ ctx, input }) => {
      if (isDemoMode) { try { return demoMeterStart({ ...input, hourlyCents: input.hourlyCents || null }); } catch (e) { throw new TRPCError({ code: "CONFLICT", message: e instanceof Error ? e.message : "Démarrage impossible." }); } }
      const [running] = await getDb().select({ id: parkingSessions.id }).from(parkingSessions).where(and(eq(parkingSessions.userId, ctx.user.id), isNull(parkingSessions.endedAt))).limit(1);
      if (running) throw new TRPCError({ code: "CONFLICT", message: "Un stationnement est déjà en cours. Arrêtez-le avant d’en démarrer un autre." });
      const [created] = await getDb().insert(parkingSessions).values({ userId: ctx.user.id, label: input.label, address: input.address || null, latitude: input.latitude ?? null, longitude: input.longitude ?? null, hourlyCents: input.hourlyCents || null }).$returningId();
      const [session] = await getDb().select().from(parkingSessions).where(eq(parkingSessions.id, created.id)).limit(1);
      return session;
    }),
    stop: authedQuery.mutation(async ({ ctx }) => {
      if (isDemoMode) { try { return demoMeterStop(); } catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: e instanceof Error ? e.message : "Arrêt impossible." }); } }
      const [session] = await getDb().select().from(parkingSessions).where(and(eq(parkingSessions.userId, ctx.user.id), isNull(parkingSessions.endedAt))).orderBy(desc(parkingSessions.startedAt)).limit(1);
      if (!session) throw new TRPCError({ code: "BAD_REQUEST", message: "Aucun stationnement en cours." });
      const endedAt = new Date();
      const totalCents = meterCostCents(session.hourlyCents, session.startedAt, endedAt);
      await getDb().update(parkingSessions).set({ endedAt, totalCents }).where(eq(parkingSessions.id, session.id));
      return { ...session, endedAt, totalCents };
    }),
    history: authedQuery.query(async ({ ctx }) => {
      if (isDemoMode) return demoMeterHistory();
      return getDb().select().from(parkingSessions).where(and(eq(parkingSessions.userId, ctx.user.id), sql`${parkingSessions.endedAt} is not null`)).orderBy(desc(parkingSessions.startedAt)).limit(50);
    }),
  }),
  owner: createRouter({
    submitVerification: ownerQuery.input(z.object({ legalName: z.string().trim().min(2).max(180), phone: z.string().trim().min(6).max(40) })).mutation(async ({ ctx, input }) => {
      await getDb().insert(ownerVerifications).values({ userId: ctx.user.id, status: "pending", legalName: input.legalName, phone: input.phone, submittedAt: new Date(), reviewedAt: null, adminNote: null }).onDuplicateKeyUpdate({ set: { status: "pending", legalName: input.legalName, phone: input.phone, submittedAt: new Date(), reviewedAt: null, adminNote: null } });
      await getDb().update(users).set({ ownerVerificationStatus: "pending" }).where(eq(users.id, ctx.user.id));
      return { ok: true };
    }),
    submitVerificationDocument: ownerQuery.input(z.object({ fileKey: z.string().min(5).max(600), documentType: z.enum(["identity", "property_proof", "company_registration"]), originalName: z.string().trim().min(1).max(180) })).mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "owner") throw new TRPCError({ code: "FORBIDDEN", message: "Réservé aux comptes propriétaires." });
      const [owned] = await getDb().select({ key: files.key }).from(files).where(and(eq(files.key, input.fileKey), eq(files.ownerId, ctx.user.id))).limit(1);
      if (!owned) throw new TRPCError({ code: "FORBIDDEN", message: "Ce document ne vous appartient pas." });
      await getDb().insert(ownerVerificationDocuments).values({ userId: ctx.user.id, fileKey: input.fileKey, documentType: input.documentType, originalName: input.originalName }).onDuplicateKeyUpdate({ set: { documentType: input.documentType, originalName: input.originalName } });
      await getDb().insert(notifications).values({ userId: ctx.user.id, title: "Document reçu", body: "Votre justificatif a été ajouté à votre dossier de vérification GOVAPARK.", kind: "account" });
      return { ok: true };
    }),
    myVerificationDocuments: ownerQuery.query(async ({ ctx }) => getDb().select({ id: ownerVerificationDocuments.id, documentType: ownerVerificationDocuments.documentType, originalName: ownerVerificationDocuments.originalName, createdAt: ownerVerificationDocuments.createdAt }).from(ownerVerificationDocuments).where(eq(ownerVerificationDocuments.userId, ctx.user.id)).orderBy(desc(ownerVerificationDocuments.createdAt))),
    dashboard: ownerQuery.query(async ({ ctx }) => {
      const db = getDb();
      const ownedListings = await db.select().from(listings).where(eq(listings.ownerId, ctx.user.id));
      const rows = await db.select({ reservation: reservations }).from(reservations)
        .innerJoin(listings, eq(reservations.listingId, listings.id))
        .where(eq(listings.ownerId, ctx.user.id));
      const paidStatuses = new Set(["confirmed", "in_progress", "completed"]);
      const paid = rows.map((row) => row.reservation).filter((reservation) => paidStatuses.has(reservation.status));
      return {
        listingsTotal: ownedListings.length,
        listingsPublished: ownedListings.filter((listing) => listing.status === "published").length,
        listingsPending: ownedListings.filter((listing) => listing.status === "pending").length,
        reservationsTotal: rows.length,
        requestsPending: rows.filter((row) => row.reservation.status === "pending").length,
        reservationsCompleted: paid.filter((reservation) => reservation.status === "completed").length,
        grossCents: paid.reduce((sum, reservation) => sum + reservation.baseCents, 0),
        commissionCents: paid.reduce((sum, reservation) => sum + reservation.commissionCents, 0),
        netCents: paid.reduce((sum, reservation) => sum + reservation.netCents, 0),
        paymentMode: "not_configured" as const,
      };
    }),
    requests: ownerQuery.query(async ({ ctx }) => {
      return getDb().select({ reservation: reservations, listing: listings }).from(reservations)
        .innerJoin(listings, eq(reservations.listingId, listings.id)).where(eq(listings.ownerId, ctx.user.id)).orderBy(desc(reservations.createdAt));
    }),
    accept: ownerQuery.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => {
      const db = getDb();
      return db.transaction(async (tx) => {
        const [request] = await tx.select({ reservation: reservations, listing: listings }).from(reservations)
          .innerJoin(listings, eq(reservations.listingId, listings.id)).where(and(eq(reservations.id, input.id), eq(listings.ownerId, ctx.user.id))).for("update").limit(1);
        if (!request || request.reservation.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "Demande introuvable ou déjà traitée." });
        if (request.reservation.expiresAt && request.reservation.expiresAt < new Date()) throw new TRPCError({ code: "BAD_REQUEST", message: "Cette demande a expiré." });
        await tx.select().from(listings).where(eq(listings.id, request.listing.id)).for("update").limit(1);
        const conflicts = await tx.select({ id: reservations.id }).from(reservations).where(and(
          eq(reservations.listingId, request.listing.id), ne(reservations.id, request.reservation.id),
          or(
            inArray(reservations.status, ["confirmed", "in_progress"]),
            and(eq(reservations.status, "payment_pending"), gt(reservations.expiresAt, new Date())),
          ),
          lt(reservations.startAt, request.reservation.endAt), gt(reservations.endAt, request.reservation.startAt),
        )).for("update").limit(1);
        if (conflicts.length) throw new TRPCError({ code: "CONFLICT", message: "Un autre créneau confirmé se chevauche. Refusez cette demande." });
        await tx.update(reservations).set({ status: "payment_pending", expiresAt: new Date(Date.now() + 30 * 60 * 1000) }).where(eq(reservations.id, request.reservation.id));
        await tx.insert(notifications).values({ userId: Number(request.reservation.userId), title: "Votre demande a été acceptée", body: "Le propriétaire a accepté votre demande. Le paiement sécurisé n’est pas encore activé : votre place n’est pas confirmée.", kind: "reservation", reservationId: request.reservation.id });
        return { status: "payment_pending", payment: "not_configured", message: "Demande acceptée. Le locataire devra payer lorsque le paiement sécurisé sera activé." };
      });
    }),
    refuse: ownerQuery.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => {
      const [owned] = await getDb().select({ id: reservations.id }).from(reservations)
        .innerJoin(listings, eq(reservations.listingId, listings.id))
        .where(and(eq(reservations.id, input.id), eq(listings.ownerId, ctx.user.id))).limit(1);
      if (!owned) throw new TRPCError({ code: "FORBIDDEN", message: "Cette demande ne vous appartient pas." });
      const [pending] = await getDb().select({ id: reservations.id }).from(reservations)
        .innerJoin(listings, eq(reservations.listingId, listings.id))
        .where(and(eq(reservations.id, input.id), eq(listings.ownerId, ctx.user.id), eq(reservations.status, "pending"))).limit(1);
      if (!pending) throw new TRPCError({ code: "BAD_REQUEST", message: "Seules les demandes en attente peuvent être refusées." });
      await getDb().update(reservations).set({ status: "cancelled" }).where(eq(reservations.id, input.id));
      const [reservation] = await getDb().select({ userId: reservations.userId }).from(reservations).where(eq(reservations.id, input.id)).limit(1);
      if (reservation) await getDb().insert(notifications).values({ userId: Number(reservation.userId), title: "Demande refusée", body: "Le propriétaire a refusé votre demande de réservation.", kind: "reservation", reservationId: input.id });
      return { status: "cancelled" };
    }),
  }),

  messaging: createRouter({
    threads: authedQuery.query(async ({ ctx }) => isDemoMode ? [] : getDb().select({ reservationId: reservations.id, listingId: listings.id, listingTitle: listings.title, status: reservations.status, startAt: reservations.startAt, endAt: reservations.endAt, customerId: reservations.userId, ownerId: listings.ownerId })
      .from(reservations).innerJoin(listings, eq(reservations.listingId, listings.id))
      .where(or(eq(reservations.userId, ctx.user.id), eq(listings.ownerId, ctx.user.id))).orderBy(desc(reservations.updatedAt)).limit(100)),
    notifications: authedQuery.query(async ({ ctx }) => isDemoMode ? [] : getDb().select().from(notifications).where(eq(notifications.userId, ctx.user.id)).orderBy(desc(notifications.createdAt)).limit(100)),
    unreadCount: authedQuery.query(async ({ ctx }) => {
      if (isDemoMode) return 0;
      const [row] = await getDb().select({ value: count() }).from(notifications).where(and(eq(notifications.userId, ctx.user.id), isNull(notifications.readAt)));
      return row?.value ?? 0;
    }),
    markNotificationRead: authedQuery.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await getDb().update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.id, input.id), eq(notifications.userId, ctx.user.id)));
      return { ok: true };
    }),
    messages: authedQuery.input(z.object({ reservationId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const [access] = await getDb().select({ reservationId: reservations.id }).from(reservations)
        .innerJoin(listings, eq(reservations.listingId, listings.id))
        .where(and(eq(reservations.id, input.reservationId), or(eq(reservations.userId, ctx.user.id), eq(listings.ownerId, ctx.user.id)))).limit(1);
      if (!access) throw new TRPCError({ code: "FORBIDDEN", message: "Cette conversation ne vous est pas accessible." });
      return getDb().select({ id: messages.id, senderId: messages.senderId, recipientId: messages.recipientId, body: messages.body, createdAt: messages.createdAt })
        .from(messages).where(eq(messages.reservationId, input.reservationId)).orderBy(messages.createdAt).limit(300);
    }),
    send: authedQuery.input(z.object({ reservationId: z.number().int().positive(), body: z.string().trim().min(1).max(2000) })).mutation(async ({ ctx, input }) => {
      const [access] = await getDb().select({ reservation: reservations, listing: listings }).from(reservations)
        .innerJoin(listings, eq(reservations.listingId, listings.id))
        .where(and(eq(reservations.id, input.reservationId), or(eq(reservations.userId, ctx.user.id), eq(listings.ownerId, ctx.user.id)))).limit(1);
      if (!access) throw new TRPCError({ code: "FORBIDDEN", message: "Cette conversation ne vous est pas accessible." });
      if (!["pending", "payment_pending", "confirmed", "in_progress", "completed", "dispute"].includes(access.reservation.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cette conversation est fermée." });
      }
      const recipientId = access.reservation.userId === ctx.user.id ? Number(access.listing.ownerId) : Number(access.reservation.userId);
      if (!recipientId || recipientId === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "Destinataire invalide." });
      const [created] = await getDb().insert(messages).values({ reservationId: input.reservationId, senderId: ctx.user.id, recipientId, body: input.body }).$returningId();
      await getDb().insert(notifications).values({ userId: recipientId, title: "Nouveau message GOVAPARK", body: input.body.slice(0, 450), kind: "message", reservationId: input.reservationId });
      return { id: created.id, sent: true };
    }),
  }),

  admin: createRouter({
    overview: adminQuery.query(async () => {
      const db = getDb();
      const [allListings, allReservations, allUsers, reports] = await Promise.all([
        db.select().from(listings), db.select().from(reservations),
        db.select().from(users), db.select().from(communityReports),
      ]);
      return {
        usersTotal: allUsers.length,
        listingsTotal: allListings.length,
        listingsPending: allListings.filter((item) => item.status === "pending").length,
        listingsPublished: allListings.filter((item) => item.status === "published").length,
        reservationsTotal: allReservations.length,
        reservationsDisputed: allReservations.filter((item) => item.status === "dispute").length,
        reportsActive: reports.filter((item) => !item.expiresAt || item.expiresAt > new Date()).length,
        paymentMode: "disabled" as const,
      };
    }),
    users: adminQuery.query(async () => getDb().select({ id: users.id, name: users.name, email: users.email, role: users.role, createdAt: users.createdAt }).from(users).orderBy(desc(users.createdAt))),
    pendingListings: adminQuery.query(async () => {
      const rows = await getDb().select().from(listings).where(eq(listings.status, "pending")).orderBy(desc(listings.createdAt));
      return withPhotoUrls(rows);
    }),
    reviewListing: adminQuery.input(z.object({ id: z.number().int().positive(), decision: z.enum(["approve", "reject", "suspend"]), reason: z.string().trim().max(500).optional() })).mutation(async ({ input }) => {
      const [listing] = await getDb().select({ id: listings.id, status: listings.status }).from(listings).where(eq(listings.id, input.id)).limit(1);
      if (!listing) throw new TRPCError({ code: "NOT_FOUND", message: "Annonce introuvable." });
      if (input.decision === "approve" && listing.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "Seules les annonces en attente peuvent être publiées." });
      const status = input.decision === "approve" ? "published" : input.decision === "reject" ? "rejected" : "suspended";
      await getDb().update(listings).set({ status, moderationNote: input.reason?.trim() || null }).where(eq(listings.id, input.id));
      await writeAdminAudit({ actorId: ctx.user.id, action: `listing_${input.decision}`, targetType: "listing", targetId: input.id, details: { reason: input.reason ?? null } });
      const [owner] = await getDb().select({ ownerId: listings.ownerId }).from(listings).where(eq(listings.id, input.id)).limit(1);
      if (owner?.ownerId) await getDb().insert(notifications).values({ userId: Number(owner.ownerId), title: "Mise à jour de votre annonce", body: `Votre annonce #${input.id} a été ${status === "published" ? "publiée" : status === "rejected" ? "refusée" : "suspendue"}.`, kind: "listing" });
      return { id: input.id, status };
    }),
    reservations: adminQuery.query(async () => getDb().select().from(reservations).orderBy(desc(reservations.createdAt)).limit(200)),
    reports: adminQuery.query(async () => getDb().select().from(communityReports).orderBy(desc(communityReports.createdAt)).limit(200)),
    closeReport: adminQuery.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => {
      const [report] = await getDb().select({ id: communityReports.id }).from(communityReports).where(eq(communityReports.id, input.id)).limit(1);
      if (!report) throw new TRPCError({ code: "NOT_FOUND", message: "Signalement introuvable." });
      await getDb().update(communityReports).set({ expiresAt: new Date(), updatedAt: new Date() }).where(eq(communityReports.id, input.id));
      return { ok: true };
    }),
    ownerVerifications: adminQuery.query(async () => {
      const rows = await getDb().select({ verification: ownerVerifications, user: users }).from(ownerVerifications).innerJoin(users, eq(ownerVerifications.userId, users.id)).where(eq(users.role, "owner")).orderBy(desc(ownerVerifications.submittedAt)).limit(200);
      const docs = rows.length ? await getDb().select().from(ownerVerificationDocuments).where(inArray(ownerVerificationDocuments.userId, rows.map(r => r.user.id))) : [];
      const keys = docs.map(d => d.fileKey); const signed = []; for (let i = 0; i < keys.length; i += 100) signed.push(...(await storage.getPresignedUrls({ keys: keys.slice(i, i + 100) })).urls); const urlByKey = new Map(signed.map(x => [x.key, x.url]));
      return rows.map(row => ({ ...row, documents: docs.filter(d => d.userId === row.user.id).map(d => ({ id: d.id, documentType: d.documentType, originalName: d.originalName, createdAt: d.createdAt, url: urlByKey.get(d.fileKey) ?? null })) }));
    }),
    reviewOwner: adminQuery.input(z.object({ userId: z.number().int().positive(), decision: z.enum(["verified", "rejected"]), note: z.string().trim().max(1000).optional() })).mutation(async ({ ctx, input }) => {
      const [account] = await getDb().select().from(users).where(eq(users.id, input.userId)).limit(1);
      if (!account || account.role !== "owner") throw new TRPCError({ code: "NOT_FOUND", message: "Compte propriétaire introuvable." });
      await getDb().insert(ownerVerifications).values({ userId: input.userId, status: input.decision, adminNote: input.note ?? null, reviewedAt: new Date() }).onDuplicateKeyUpdate({ set: { status: input.decision, adminNote: input.note ?? null, reviewedAt: new Date() } });
      await getDb().update(users).set({ ownerVerificationStatus: input.decision }).where(eq(users.id, input.userId));
      await writeAdminAudit({ actorId: ctx.user.id, action: `owner_${input.decision}`, targetType: "user", targetId: input.userId, details: { note: input.note ?? null } });
      await getDb().insert(notifications).values({ userId: input.userId, title: input.decision === "verified" ? "Compte propriétaire validé" : "Vérification propriétaire refusée", body: input.note?.slice(0, 450) || (input.decision === "verified" ? "Votre dossier a été validé. Vous pouvez maintenant publier vos annonces." : "Votre dossier doit être corrigé. Consultez votre espace propriétaire."), kind: "account" });
      return { ok: true };
    }),
    changeUserRole: adminQuery.input(z.object({ userId: z.number().int().positive(), role: z.enum(["user", "owner"]) })).mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "Vous ne pouvez pas modifier votre propre rôle." });
      const [account] = await getDb().select({ id: users.id, role: users.role }).from(users).where(eq(users.id, input.userId)).limit(1);
      if (!account || account.role === "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Modification de ce compte interdite." });
      await getDb().update(users).set({ role: input.role, ownerVerificationStatus: input.role === "owner" ? "pending" : "not_applicable" }).where(eq(users.id, input.userId));
      await writeAdminAudit({ actorId: ctx.user.id, action: "user_role_changed", targetType: "user", targetId: input.userId, details: { role: input.role } });
      if (input.role === "owner") await getDb().insert(ownerVerifications).values({ userId: input.userId, status: "pending" }).onDuplicateKeyUpdate({ set: { status: "pending", reviewedAt: null } });
      return { ok: true };
    }),
    disputes: adminQuery.query(async () => getDb().select({ dispute: disputes, reservation: reservations, listing: listings, customer: users }).from(disputes).innerJoin(reservations, eq(disputes.reservationId, reservations.id)).innerJoin(listings, eq(reservations.listingId, listings.id)).innerJoin(users, eq(disputes.openedBy, users.id)).orderBy(desc(disputes.createdAt)).limit(200)),
    resolveDispute: adminQuery.input(z.object({ id: z.number().int().positive(), status: z.enum(["under_review", "resolved", "rejected"]), resolution: z.string().trim().min(3).max(2000) })).mutation(async ({ ctx, input }) => {
      const [row] = await getDb().select().from(disputes).where(eq(disputes.id, input.id)).limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Litige introuvable." });
      await getDb().update(disputes).set({ status: input.status, resolution: input.resolution, updatedAt: new Date() }).where(eq(disputes.id, input.id));
      await writeAdminAudit({ actorId: ctx.user.id, action: `dispute_${input.status}`, targetType: "dispute", targetId: input.id, details: { resolution: input.resolution } });
      return { ok: true };
    }),
    commissionSettings: adminQuery.query(async () => { const [row] = await getDb().select().from(companySettings).where(eq(companySettings.id, 1)).limit(1); return row ?? { id: 1, commissionBps: 1200, updatedAt: new Date() }; }),
    updateCommissionSettings: adminQuery.input(z.object({ commissionBps: z.number().int().min(0).max(5000) })).mutation(async ({ ctx, input }) => { await getDb().insert(companySettings).values({ id: 1, commissionBps: input.commissionBps }).onDuplicateKeyUpdate({ set: { commissionBps: input.commissionBps, updatedAt: new Date() } }); await writeAdminAudit({ actorId: ctx.user.id, action: "commission_updated", targetType: "company_settings", targetId: 1, details: { commissionBps: input.commissionBps } }); return { ok: true }; }),
    financialOverview: adminQuery.query(async () => {
      const rows = await getDb().select().from(reservations);
      const eligible = rows.filter(r => ["confirmed", "in_progress", "completed"].includes(r.status));
      const paidOrActive = eligible.reduce((a,r) => ({ gross: a.gross+r.baseCents, commission: a.commission+r.commissionCents, ownerNet: a.ownerNet+r.netCents, fees: a.fees+r.feeCents }), { gross:0, commission:0, ownerNet:0, fees:0 });
      const byMonth = new Map<string, number>();
      for (const r of eligible) { const k = `${r.createdAt.getFullYear()}-${String(r.createdAt.getMonth()+1).padStart(2,"0")}`; byMonth.set(k,(byMonth.get(k)??0)+r.commissionCents); }
      return { ...paidOrActive, eligibleReservations: eligible.length, pendingPayment: rows.filter(r=>r.status==="payment_pending").length, disputed: rows.filter(r=>r.status==="dispute").length, byMonth:[...byMonth].sort(([a],[b])=>a.localeCompare(b)).slice(-12).map(([month,commissionCents])=>({month,commissionCents})), paymentLive:false, note:"Montants calculés depuis les réservations confirmées/en cours/terminées. Les encaissements réels ne sont pas vérifiables tant que le prestataire de paiement n’est pas connecté." };
    }),
    regionalActivity: adminQuery.query(async () => {
      const listingRows = await getDb().select({ address: listings.approxAddress, status: listings.status }).from(listings);
      const reservationRows = await getDb().select({ address: listings.approxAddress, status: reservations.status }).from(reservations).innerJoin(listings, eq(reservations.listingId, listings.id));
      const deptRegion: Record<string,string> = {};
      const sets: Record<string,string[]> = {"Île-de-France":["75","77","78","91","92","93","94","95"],"Hauts-de-France":["02","59","60","62","80"],"Normandie":["14","27","50","61","76"],"Bretagne":["22","29","35","56"],"Pays de la Loire":["44","49","53","72","85"],"Centre-Val de Loire":["18","28","36","37","41","45"],"Bourgogne-Franche-Comté":["21","25","39","58","70","71","89","90"],"Grand Est":["08","10","51","52","54","55","57","67","68","88"],"Nouvelle-Aquitaine":["16","17","19","23","24","33","40","47","64","79","86","87"],"Occitanie":["09","11","12","30","31","32","34","46","48","65","66","81","82"],"Auvergne-Rhône-Alpes":["01","03","07","15","26","38","42","43","63","69","73","74"],"Provence-Alpes-Côte d’Azur":["04","05","06","13","83","84"],"Corse":["2A","2B"],"Guadeloupe":["971"],"Martinique":["972"],"Guyane":["973"],"La Réunion":["974"],"Mayotte":["976"]};
      for (const [region,codes] of Object.entries(sets)) for (const code of codes) deptRegion[code]=region;
      const getRegion=(address:string)=>{ const m=address.match(/(?:^|\s)(2A|2B|97[1-6]|0[1-9]|[1-9][0-9])(?:\d{3})?(?:\s|$)/); return m ? (deptRegion[m[1]] ?? "Non classé") : "Non classé"; };
      const acc=new Map<string,{region:string,listings:number,reservations:number,published:number}>();
      for (const row of listingRows) { const region=getRegion(row.address); const x=acc.get(region)??{region,listings:0,reservations:0,published:0}; x.listings++; if(row.status==="published")x.published++; acc.set(region,x); }
      for (const row of reservationRows) { const region=getRegion(row.address); const x=acc.get(region)??{region,listings:0,reservations:0,published:0}; x.reservations++; acc.set(region,x); }
      return [...acc.values()].sort((a,b)=>b.listings+b.reservations-(a.listings+a.reservations));
    }),
    auditLogs: adminQuery.query(async () => getDb().select({ log: adminAuditLogs, actorName: users.name, actorEmail: users.email }).from(adminAuditLogs).leftJoin(users, eq(adminAuditLogs.actorId, users.id)).orderBy(desc(adminAuditLogs.createdAt)).limit(300)),
    refundRequests: adminQuery.query(async () => getDb().select({ refund: refundRequests, reservation: reservations, requester: users, listing: listings }).from(refundRequests).innerJoin(reservations, eq(refundRequests.reservationId, reservations.id)).innerJoin(users, eq(refundRequests.requestedBy, users.id)).innerJoin(listings, eq(reservations.listingId, listings.id)).orderBy(desc(refundRequests.createdAt)).limit(200)),
    reviewRefund: adminQuery.input(z.object({ id: z.number().int().positive(), decision: z.enum(["under_review", "approved", "rejected", "processed"]), note: z.string().trim().max(1500).optional(), providerReference: z.string().trim().max(180).optional() })).mutation(async ({ ctx, input }) => {
      const [row] = await getDb().select().from(refundRequests).where(eq(refundRequests.id, input.id)).limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Demande de remboursement introuvable." });
      if (input.decision === "processed" && !input.providerReference?.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "Une référence de remboursement externe est obligatoire. Effectuez d'abord le remboursement chez le prestataire." });
      if (row.status === "processed" || row.status === "rejected") throw new TRPCError({ code: "CONFLICT", message: "Cette demande est déjà clôturée." });
      await getDb().update(refundRequests).set({ status: input.decision, adminNote: input.note ?? null, providerReference: input.decision === "processed" ? input.providerReference : row.providerReference, updatedAt: new Date() }).where(eq(refundRequests.id, input.id));
      if (input.decision === "processed") await getDb().update(reservations).set({ status: "refunded" }).where(eq(reservations.id, row.reservationId));
      if (input.decision === "rejected") { const restoreStatus = row.previousStatus === "completed" ? "completed" : "confirmed"; await getDb().update(reservations).set({ status: restoreStatus }).where(and(eq(reservations.id, row.reservationId), eq(reservations.status, "refund_pending"))); }
      await writeAdminAudit({ actorId: ctx.user.id, action: `refund_${input.decision}`, targetType: "refund_request", targetId: input.id, details: { reservationId: row.reservationId, providerReference: input.providerReference ?? null, note: input.note ?? null } });
      await getDb().insert(notifications).values({ userId: row.requestedBy, title: "Mise à jour de votre demande de remboursement", body: input.decision === "processed" ? "Le remboursement a été marqué comme effectué par GOVAPARK." : input.note?.slice(0, 450) || `Votre demande est maintenant au statut : ${input.decision}.`, kind: "refund", reservationId: row.reservationId });
      return { ok: true, status: input.decision };
    }),
    paymentReadiness: adminQuery.query(() => ({
      provider: "stripe_connect",
      enabled: false,
      canCharge: false,
      canTransfer: false,
      reason: "Stripe Connect n’est pas encore configuré. Aucun paiement ni reversement ne peut être effectué.",
      requiredEnvironment: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_CONNECT_CLIENT_ID"],
    })),
  }),

  community: createRouter({
    list: publicQuery.query(async () => {
      if (isDemoMode) return demoReports();
      const db = getDb();
      const cutoff = new Date(Date.now() - 30 * 60000);
      const reports = await db.select().from(communityReports).where(and(
        gt(communityReports.updatedAt, cutoff), or(isNull(communityReports.expiresAt), gt(communityReports.expiresAt, new Date())),
      )).orderBy(desc(communityReports.updatedAt));
      const votes = await db.select().from(reportVotes);
      return reports.map((report) => {
        const confirmations = votes.filter((vote) => vote.reportId === report.id && vote.vote === "confirm").length;
        const contradictions = votes.filter((vote) => vote.reportId === report.id && vote.vote === "contradict").length;
        return { ...report, confirmations, contradictions, parkingStatus: reportStatus({ ...report, confirmations, contradictions }) };
      }).filter((report) => !report.parkingStatus.stale);
    }),
    create: authedQuery.input(z.object({
      kind: z.enum(["free", "occupied", "departure"]), latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180),
      address: z.string().min(3).max(255), estimatedDeparture: z.date().optional(),
    })).mutation(async ({ ctx, input }) => {
      if (isDemoMode) { if (input.kind === "departure" && !input.estimatedDeparture) throw new TRPCError({ code: "BAD_REQUEST", message: "Indiquez une heure estimée de départ." }); return demoCreateReport(input); }
      const db = getDb();
      const [recent] = await db.select({ value: count() }).from(communityReports).where(and(eq(communityReports.userId, ctx.user.id), gt(communityReports.createdAt, new Date(Date.now() - 3600000))));
      if ((recent?.value ?? 0) >= 5) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Limite atteinte : 5 signalements par heure. Réessayez plus tard." });
      if (input.kind === "departure" && !input.estimatedDeparture) throw new TRPCError({ code: "BAD_REQUEST", message: "Indiquez une heure estimée de départ." });
      const [created] = await db.insert(communityReports).values({ ...input, userId: ctx.user.id, source: `${ctx.user.name ?? "Utilisateur"} · communauté`, confidence: 50 }).$returningId();
      if (input.kind === "departure") await recordParkingObservation({ latitude: input.latitude, longitude: input.longitude, kind: "departure", reportId: created.id });
      return { id: created.id };
    }),
    vote: authedQuery.input(z.object({ reportId: z.number().int(), vote: z.enum(["confirm", "contradict"]) })).mutation(async ({ ctx, input }) => {
      if (isDemoMode) return demoVote(input.reportId, input.vote);
      const db = getDb();
      const [report] = await db.select().from(communityReports).where(eq(communityReports.id, input.reportId)).limit(1);
      if (!report) throw new TRPCError({ code: "NOT_FOUND" });
      if (report.userId === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "Vous ne pouvez pas évaluer votre propre signalement." });
      const [previousVote] = await db.select().from(reportVotes).where(and(eq(reportVotes.reportId, input.reportId), eq(reportVotes.userId, ctx.user.id))).limit(1);
      if (previousVote) throw new TRPCError({ code: "CONFLICT", message: "Vous avez déjà évalué ce signalement." });
      await db.insert(reportVotes).values({ ...input, userId: ctx.user.id });
      const votes = await db.select().from(reportVotes).where(eq(reportVotes.reportId, input.reportId));
      const confirms = votes.filter((v) => v.vote === "confirm").length;
      const contradicts = votes.filter((v) => v.vote === "contradict").length;
      const confidence = Math.max(5, Math.min(98, 50 + confirms * 12 - contradicts * 18));
      await db.update(communityReports).set({ confidence }).where(eq(communityReports.id, input.reportId));
      if (!previousVote) await recordParkingObservation({ latitude: report.latitude, longitude: report.longitude, kind: input.vote === "confirm" ? (report.kind === "occupied" ? "occupied_confirmed" : report.kind === "departure" ? "departure" : "free_confirmed") : "contradiction", reportId: report.id });
      if (input.vote === "confirm" && confirms >= 2 && (report.kind === "free" || report.kind === "occupied")) {
        const cellKey = observationCell(report.latitude, report.longitude).cellKey;
        const now = new Date();
        await db.update(predictionEvaluations).set({ actualOutcome: report.kind, observedAt: now, sourceObservationId: report.id }).where(and(eq(predictionEvaluations.cellKey, cellKey), isNull(predictionEvaluations.actualOutcome), lt(predictionEvaluations.evaluateAfter, now), gt(predictionEvaluations.predictedAt, new Date(now.getTime() - 6 * 3600000))));
      }
      return { confidence };
    }),
    updateDeparture: authedQuery.input(z.object({ id: z.number().int(), estimatedDeparture: z.date() })).mutation(async ({ ctx, input }) => {
      if (isDemoMode) return demoUpdateDeparture(input.id, input.estimatedDeparture);
      await getDb().update(communityReports).set({ estimatedDeparture: input.estimatedDeparture, updatedAt: new Date() }).where(and(eq(communityReports.id, input.id), eq(communityReports.userId, ctx.user.id), eq(communityReports.kind, "departure")));
      return { ok: true };
    }),
    stopDeparture: authedQuery.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => {
      if (isDemoMode) return demoStopReport(input.id);
      await getDb().update(communityReports).set({ expiresAt: new Date() }).where(and(eq(communityReports.id, input.id), eq(communityReports.userId, ctx.user.id)));
      return { ok: true };
    }),
    autoRelease: authedQuery.input(z.object({ id: z.number().int().positive(), latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), accuracy: z.number().min(0).max(60) })).mutation(async ({ ctx, input }) => {
      const [report] = await getDb().select().from(communityReports).where(and(eq(communityReports.id,input.id),eq(communityReports.userId,ctx.user.id),eq(communityReports.kind,"departure"))).limit(1);
      if (!report) throw new TRPCError({ code:"NOT_FOUND", message:"Départ introuvable ou vous n’en êtes pas l’auteur." });
      const latMeters=(input.latitude-report.latitude)*111320;
      const lngMeters=(input.longitude-report.longitude)*111320*Math.cos(report.latitude*Math.PI/180);
      if (Math.hypot(latMeters,lngMeters)<120) throw new TRPCError({code:"BAD_REQUEST",message:"Le déplacement est insuffisant pour libérer la place."});
      await getDb().update(communityReports).set({ kind:"free", confidence:65, source:"Départ détecté par GPS avec accord de l’utilisateur", updatedAt:new Date(), expiresAt:new Date(Date.now()+15*60000) }).where(eq(communityReports.id,input.id));
      await recordParkingObservation({ latitude: report.latitude, longitude: report.longitude, kind: "free_confirmed", reportId: report.id });
      return { ok:true, confidence:65, expiresInMinutes:15 };
    }),
  }),

  intelligence: createRouter({
    predictions: publicQuery.input(z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), radiusKm: z.number().min(1).max(20).default(5) })).query(async ({ input }) => {
      if (isDemoMode) return { generatedAt: new Date(), periodDays: 90, totalObservations: 0, currentWeekday: new Date().getDay(), currentHour: new Date().getHours(), predictions: [] as Array<{ cellKey: string; latitude: number; longitude: number; weekday: number; hour: number; observations: number; freeSignals: number; departures: number; occupiedSignals: number; contradictions: number; score: number; confidence: string }> };
      const db = getDb(); const since = new Date(Date.now() - 90 * 86400000); const now = new Date();
      const parisParts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(now);
      const currentWeekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parisParts.find(p => p.type === "weekday")?.value ?? "Sun");
      const currentHour = Number(parisParts.find(p => p.type === "hour")?.value ?? "0");
      const observations = await db.select().from(parkingObservations).where(gt(parkingObservations.createdAt, since));
      // Comparaison aux mêmes jours de semaine et à la même tranche horaire (±1 h).
      const candidates = observations.filter(o => {
        const dLat = (o.latitude - input.latitude) * 111.32;
        const dLng = (o.longitude - input.longitude) * 111.32 * Math.cos(input.latitude * Math.PI / 180);
        return Math.hypot(dLat, dLng) <= input.radiusKm && o.weekday === currentWeekday && Math.abs(o.hour - currentHour) <= 1;
      });
      const groups = new Map<string, typeof candidates>();
      for (const o of candidates) { const group = groups.get(o.cellKey) ?? []; group.push(o); groups.set(o.cellKey, group); }
      const output = [...groups.entries()].map(([cellKey, rows]) => {
        const positive = rows.filter(r => r.kind === "free_confirmed").length;
        const occupied = rows.filter(r => r.kind === "occupied_confirmed").length;
        const departures = rows.filter(r => r.kind === "departure").length;
        const contradictions = rows.filter(r => r.kind === "contradiction").length;
        const total = positive + occupied + departures + contradictions;
        // Lissage bayésien prudent : a priori 1/3, 3 observations virtuelles.
        const score = Math.max(0, Math.min(100, Math.round(100 * (positive + departures * 0.45 + 1) / (total + 3) - contradictions * 2)));
        const [lat, lng] = cellKey.split(":").map(Number);
        return { cellKey, latitude: lat, longitude: lng, weekday: currentWeekday, hour: currentHour, observations: total, freeSignals: positive, departures, occupiedSignals: occupied, contradictions, score, confidence: total >= 20 ? "élevée" : total >= 8 ? "moyenne" : "faible" };
      }).filter(x => x.observations >= 3).sort((a,b) => b.score - a.score || b.observations - a.observations).slice(0, 30);
      if (output.length) {
        const snapshotCutoff = new Date(now.getTime() - 30 * 60000);
        const existing = await db.select({ cellKey: predictionEvaluations.cellKey }).from(predictionEvaluations).where(and(gt(predictionEvaluations.predictedAt, snapshotCutoff), inArray(predictionEvaluations.cellKey, output.map(x => x.cellKey))));
        const seen = new Set(existing.map(x => x.cellKey));
        const fresh = output.filter(x => !seen.has(x.cellKey));
        if (fresh.length) await db.insert(predictionEvaluations).values(fresh.map(x => ({ cellKey: x.cellKey, predictedScore: x.score, predictedAt: now, evaluateAfter: new Date(now.getTime() + 30 * 60000) })));
      }
      return { generatedAt: now, periodDays: 90, totalObservations: candidates.length, currentWeekday, currentHour, predictions: output };
    }),
    companyOverview: adminQuery.query(async () => {
      const db = getDb(); const since = new Date(Date.now() - 90 * 86400000);
      const observations = await db.select().from(parkingObservations).where(gt(parkingObservations.createdAt, since));
      const [userCount] = await db.select({ value: count() }).from(users);
      const [listingCount] = await db.select({ value: count() }).from(listings);
      const [reservationCount] = await db.select({ value: count() }).from(reservations);
      const grouped = new Map<string, { cellKey: string; latitude: number; longitude: number; count: number; free: number; occupied: number; departure: number }>();
      for (const o of observations) { const row = grouped.get(o.cellKey) ?? { cellKey: o.cellKey, latitude: o.latitude, longitude: o.longitude, count: 0, free: 0, occupied: 0, departure: 0 }; row.count++; if (o.kind === "free_confirmed") row.free++; if (o.kind === "occupied_confirmed") row.occupied++; if (o.kind === "departure") row.departure++; grouped.set(o.cellKey, row); }
      const hotZones = [...grouped.values()].sort((a,b) => b.count-a.count).slice(0, 12);
      const byHour = Array.from({ length: 24 }, (_, hour) => ({ hour, count: observations.filter(o => o.hour === hour).length }));
      const evaluations = await db.select().from(predictionEvaluations).where(gt(predictionEvaluations.predictedAt, since));
      const evaluated = evaluations.filter(x => x.actualOutcome !== null);
      const predictedPositive = evaluated.filter(x => x.predictedScore >= 50);
      const truePositive = predictedPositive.filter(x => x.actualOutcome === "free");
      const actualPositive = evaluated.filter(x => x.actualOutcome === "free");
      const correct = evaluated.filter(x => (x.predictedScore >= 50) === (x.actualOutcome === "free"));
      const brier = evaluated.length ? evaluated.reduce((sum,x) => sum + Math.pow(x.predictedScore / 100 - (x.actualOutcome === "free" ? 1 : 0), 2), 0) / evaluated.length : null;
      const predictionMetrics = { snapshots: evaluations.length, evaluated: evaluated.length, accuracyPct: evaluated.length ? Math.round(correct.length / evaluated.length * 100) : null, precisionFreePct: predictedPositive.length ? Math.round(truePositive.length / predictedPositive.length * 100) : null, recallFreePct: actualPositive.length ? Math.round(truePositive.length / actualPositive.length * 100) : null, brierScore: brier === null ? null : Math.round(brier * 1000) / 1000 };
      return { totalUsers: userCount?.value ?? 0, totalListings: listingCount?.value ?? 0, totalReservations: reservationCount?.value ?? 0, totalObservations: observations.length, zoneCount: grouped.size, freeSignals: observations.filter(o => o.kind === "free_confirmed").length, occupiedSignals: observations.filter(o => o.kind === "occupied_confirmed").length, departureSignals: observations.filter(o => o.kind === "departure").length, hotZones, byHour, predictionMetrics, periodDays: 90 };
    }),
  }),

  alerts: createRouter({
    get: authedQuery.query(async ({ ctx }) => {
      const [alert] = await getDb().select().from(proximityAlerts).where(eq(proximityAlerts.userId, ctx.user.id)).limit(1);
      return alert ?? { enabled: false, radiusMeters: 800, placeType: "tous", maxAgeMinutes: 15 };
    }),
    save: authedQuery.input(z.object({ enabled: z.boolean(), radiusMeters: z.number().int().min(100).max(5000), placeType: z.string(), maxAgeMinutes: z.number().int().min(5).max(30) })).mutation(async ({ ctx, input }) => {
      await getDb().insert(proximityAlerts).values({ ...input, userId: ctx.user.id }).onDuplicateKeyUpdate({ set: input });
      return { ok: true };
    }),
  }),

  storage: createRouter({
    upload: authedQuery.input(z.object({ name: z.string().max(180), contentBase64: z.string().max(14_000_000), contentType: z.string().optional() })).mutation(async ({ ctx, input }) => {
      const bytes = Uint8Array.from(Buffer.from(input.contentBase64, "base64"));
      if (bytes.byteLength > 10_000_000) throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "Photo limitée à 10 Mo." });
      const saved = await storage.uploadFile({ fileContent: bytes, fileName: `u/${ctx.user.id}/${input.name}`, contentType: input.contentType });
      await getDb().insert(files).values({ key: saved.key, ownerId: ctx.user.id, name: saved.fileName, size: saved.size });
      return { key: saved.key, size: saved.size };
    }),
  }),
});
