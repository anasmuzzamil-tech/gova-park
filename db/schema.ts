import {
  mysqlTable,
  mysqlEnum,
  serial,
  varchar,
  text,
  timestamp,
  bigint,
  int,
  double,
  boolean,
  uniqueIndex,
  index,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: serial("id").primaryKey(),
  unionId: varchar("unionId", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 320 }),
  avatar: text("avatar"),
  role: mysqlEnum("role", ["user", "owner", "admin"]).default("user").notNull(),
  ownerVerificationStatus: mysqlEnum("ownerVerificationStatus", ["not_applicable", "pending", "verified", "rejected"]).default("not_applicable").notNull(),
  passwordHash: varchar("passwordHash", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
  lastSignInAt: timestamp("lastSignInAt").defaultNow().notNull(),
}, (table) => ({ emailUnique: uniqueIndex("users_email_unique").on(table.email) }));

export const listings = mysqlTable("listings", {
  id: serial("id").primaryKey(),
  ownerId: bigint("ownerId", { mode: "number", unsigned: true }),
  title: varchar("title", { length: 180 }).notNull(),
  description: text("description").notNull(),
  approxAddress: varchar("approxAddress", { length: 255 }).notNull(),
  exactAddress: varchar("exactAddress", { length: 255 }).notNull(),
  accessInstructions: text("accessInstructions").notNull(),
  latitude: double("latitude").notNull(),
  longitude: double("longitude").notNull(),
  placeType: mysqlEnum("placeType", ["garage", "residence", "entreprise", "parking"]).notNull(),
  covered: boolean("covered").default(true).notNull(),
  lengthM: double("lengthM").notNull(),
  widthM: double("widthM").notNull(),
  heightCm: int("heightCm").notNull(),
  hourlyCents: int("hourlyCents").notNull(),
  dailyCents: int("dailyCents").notNull(),
  weeklyCents: int("weeklyCents").notNull(),
  bookingMode: mysqlEnum("bookingMode", ["instant", "validation"]).notNull(),
  status: mysqlEnum("listingStatus", ["draft", "pending", "published", "suspended", "rejected", "archived"]).default("draft").notNull(),
  moderationNote: text("moderationNote"),
  photos: text("photos").notNull(),
  mainPhoto: int("mainPhoto").default(0).notNull(),
  availability: text("availability").notNull(),
  blocked: text("blocked").notNull(),
  rating: double("rating").default(0).notNull(),
  reviewCount: int("reviewCount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const reservations = mysqlTable("reservations", {
  id: serial("id").primaryKey(),
  listingId: bigint("listingId", { mode: "number", unsigned: true }).notNull(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  startAt: timestamp("startAt").notNull(),
  endAt: timestamp("endAt").notNull(),
  vehiclePlate: varchar("vehiclePlate", { length: 12 }),
  status: mysqlEnum("reservationStatus", [
    "pending", "payment_pending", "confirmed", "in_progress", "completed",
    "cancelled", "refund_pending", "refunded", "dispute",
  ]).notNull(),
  baseCents: int("baseCents").notNull(),
  feeCents: int("feeCents").notNull(),
  totalCents: int("totalCents").notNull(),
  commissionCents: int("commissionCents").notNull(),
  netCents: int("netCents").notNull(),
  expiresAt: timestamp("expiresAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
});

export const communityReports = mysqlTable("communityReports", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }),
  kind: mysqlEnum("reportKind", ["free", "occupied", "departure"]).notNull(),
  latitude: double("latitude").notNull(),
  longitude: double("longitude").notNull(),
  address: varchar("address", { length: 255 }).notNull(),
  source: varchar("source", { length: 120 }).notNull(),
  confidence: int("confidence").default(50).notNull(),
  estimatedDeparture: timestamp("estimatedDeparture"),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const reportVotes = mysqlTable("reportVotes", {
  id: serial("id").primaryKey(),
  reportId: bigint("reportId", { mode: "number", unsigned: true }).notNull(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  vote: mysqlEnum("vote", ["confirm", "contradict"]).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  reportUserUnique: uniqueIndex("report_user_unique").on(table.reportId, table.userId),
}));

export const favorites = mysqlTable("favorites", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  listingId: bigint("listingId", { mode: "number", unsigned: true }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  favoriteUnique: uniqueIndex("favorite_user_listing_unique").on(table.userId, table.listingId),
}));

export const proximityAlerts = mysqlTable("proximityAlerts", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull().unique(),
  enabled: boolean("enabled").default(true).notNull(),
  radiusMeters: int("radiusMeters").default(800).notNull(),
  placeType: varchar("placeType", { length: 40 }).default("tous").notNull(),
  maxAgeMinutes: int("maxAgeMinutes").default(15).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
});

export const files = mysqlTable("files", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 600 }).notNull().unique(),
  ownerId: bigint("ownerId", { mode: "number", unsigned: true }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  size: int("size").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});



export const notifications = mysqlTable("notifications", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  title: varchar("title", { length: 160 }).notNull(),
  body: varchar("body", { length: 500 }).notNull(),
  kind: varchar("kind", { length: 40 }).default("message").notNull(),
  reservationId: bigint("reservationId", { mode: "number", unsigned: true }),
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const messages = mysqlTable("messages", {
  id: serial("id").primaryKey(),
  reservationId: bigint("reservationId", { mode: "number", unsigned: true }).notNull(),
  senderId: bigint("senderId", { mode: "number", unsigned: true }).notNull(),
  recipientId: bigint("recipientId", { mode: "number", unsigned: true }).notNull(),
  body: varchar("body", { length: 2000 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});



// Historique anonymisé des observations utilisé pour apprendre les tendances
// par zone géographique, jour de semaine et heure locale.
export const parkingObservations = mysqlTable("parkingObservations", {
  id: serial("id").primaryKey(),
  cellKey: varchar("cellKey", { length: 32 }).notNull(),
  latitude: double("latitude").notNull(),
  longitude: double("longitude").notNull(),
  kind: mysqlEnum("observationKind", ["free_confirmed", "occupied_confirmed", "departure", "contradiction"]).notNull(),
  weekday: int("weekday").notNull(),
  hour: int("hour").notNull(),
  reportId: bigint("reportId", { mode: "number", unsigned: true }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  cellTimeIndex: index("parking_observations_cell_time_idx").on(table.cellKey, table.weekday, table.hour),
  createdIndex: index("parking_observations_created_idx").on(table.createdAt),
}));

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Listing = typeof listings.$inferSelect;
export type Reservation = typeof reservations.$inferSelect;
export type CommunityReport = typeof communityReports.$inferSelect;
export type ProximityAlert = typeof proximityAlerts.$inferSelect;


export const ownerVerifications = mysqlTable("ownerVerifications", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull().unique(),
  status: mysqlEnum("status", ["pending", "verified", "rejected"]).default("pending").notNull(),
  legalName: varchar("legalName", { length: 180 }),
  phone: varchar("phone", { length: 40 }),
  adminNote: text("adminNote"),
  submittedAt: timestamp("submittedAt").defaultNow().notNull(),
  reviewedAt: timestamp("reviewedAt"),
});

export const companySettings = mysqlTable("companySettings", {
  id: int("id").primaryKey(),
  commissionBps: int("commissionBps").default(1200).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
});

export const disputes = mysqlTable("disputes", {
  id: serial("id").primaryKey(),
  reservationId: bigint("reservationId", { mode: "number", unsigned: true }).notNull().unique(),
  openedBy: bigint("openedBy", { mode: "number", unsigned: true }).notNull(),
  reason: varchar("reason", { length: 1000 }).notNull(),
  status: mysqlEnum("status", ["open", "under_review", "resolved", "rejected"]).default("open").notNull(),
  resolution: text("resolution"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
});


export const predictionEvaluations = mysqlTable("predictionEvaluations", {
  id: serial("id").primaryKey(),
  cellKey: varchar("cellKey", { length: 32 }).notNull(),
  predictedScore: int("predictedScore").notNull(),
  predictedAt: timestamp("predictedAt").defaultNow().notNull(),
  evaluateAfter: timestamp("evaluateAfter").notNull(),
  actualOutcome: mysqlEnum("actualOutcome", ["free", "occupied"]),
  observedAt: timestamp("observedAt"),
  sourceObservationId: bigint("sourceObservationId", { mode: "number", unsigned: true }),
}, (table) => ({
  cellPredictionIndex: index("prediction_evaluations_cell_time_idx").on(table.cellKey, table.predictedAt),
  evaluationTimeIndex: index("prediction_evaluations_due_idx").on(table.evaluateAfter, table.actualOutcome),
}));


// Journal immuable des opérations sensibles réalisées par l'équipe GOVAPARK.
export const adminAuditLogs = mysqlTable("adminAuditLogs", {
  id: serial("id").primaryKey(),
  actorId: bigint("actorId", { mode: "number", unsigned: true }).notNull(),
  action: varchar("action", { length: 100 }).notNull(),
  targetType: varchar("targetType", { length: 60 }).notNull(),
  targetId: varchar("targetId", { length: 80 }),
  details: text("details"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({ actorIndex: index("admin_audit_actor_idx").on(table.actorId, table.createdAt), actionIndex: index("admin_audit_action_idx").on(table.action, table.createdAt) }));

// Demandes de remboursement suivies séparément du statut de réservation.
// "processed" signifie qu'un remboursement a été effectué hors GOVAPARK et référencé.
export const refundRequests = mysqlTable("refundRequests", {
  id: serial("id").primaryKey(),
  reservationId: bigint("reservationId", { mode: "number", unsigned: true }).notNull().unique(),
  requestedBy: bigint("requestedBy", { mode: "number", unsigned: true }).notNull(),
  reason: varchar("reason", { length: 1000 }).notNull(),
  previousStatus: varchar("previousStatus", { length: 40 }).default("confirmed").notNull(),
  status: mysqlEnum("refundRequestStatus", ["requested", "under_review", "approved", "rejected", "processed"]).default("requested").notNull(),
  amountCents: int("amountCents").notNull(),
  providerReference: varchar("providerReference", { length: 180 }),
  adminNote: text("adminNote"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => ({ statusIndex: index("refund_requests_status_idx").on(table.status, table.createdAt) }));

// Pièces de vérification du propriétaire : seuls les propriétaires et admins autorisés
// peuvent obtenir une URL signée ; le chemin permanent seul est stocké en base.
export const ownerVerificationDocuments = mysqlTable("ownerVerificationDocuments", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  fileKey: varchar("fileKey", { length: 600 }).notNull(),
  documentType: mysqlEnum("ownerDocumentType", ["identity", "property_proof", "company_registration"]).notNull(),
  originalName: varchar("originalName", { length: 180 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({ ownerIndex: index("owner_verification_docs_user_idx").on(table.userId, table.createdAt) }));


// Appareils mobiles autorisés à recevoir des notifications push.
export const pushDevices = mysqlTable("pushDevices", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  token: varchar("token", { length: 512 }).notNull().unique(),
  platform: mysqlEnum("pushPlatform", ["ios", "android"]).notNull(),
  deviceId: varchar("deviceId", { length: 160 }),
  isActive: boolean("isActive").default(true).notNull(),
  lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({ userActiveIndex: index("push_devices_user_active_idx").on(table.userId, table.isActive) }));
