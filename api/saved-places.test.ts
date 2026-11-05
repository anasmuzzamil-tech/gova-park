import { describe, expect, it } from "vitest";
import { EMPTY_PLACES, MAX_FAVORITES, MAX_NAME, MAX_RECENTS, PLACES_KEY, addRecent, getFavorite, loadPlaces, parsePlaces, removeFavorite, removeRecent, savePlaces, setFavorite } from "../src/lib/saved-places";

const P = (n: number) => ({ label: `Rue ${n}, Paris`, lat: 48.8 + n * 0.01, lng: 2.3 + n * 0.01 });
const fakeStorage = (init: Record<string, string> = {}) => { const m = { ...init }; return { getItem: (k: string) => m[k] ?? null, setItem: (k: string, v: string) => { m[k] = v; }, dump: m }; };

describe("destinations récentes", () => {
  it("la dernière destination passe en tête", () => {
    let s = addRecent(EMPTY_PLACES, P(1), 1); s = addRecent(s, P(2), 2);
    expect(s.recents.map((r) => r.label)).toEqual(["Rue 2, Paris", "Rue 1, Paris"]);
  });
  it("plafond de 10 : les plus anciennes sortent", () => {
    let s = EMPTY_PLACES; for (let i = 1; i <= 14; i++) s = addRecent(s, P(i), i);
    expect(s.recents).toHaveLength(MAX_RECENTS);
    expect(s.recents[0].label).toBe("Rue 14, Paris"); expect(s.recents[9].label).toBe("Rue 5, Paris");
  });
  it("même libellé (casse ignorée) ou même point à moins de 30 m : une seule entrée, remontée en tête", () => {
    let s = addRecent(EMPTY_PLACES, P(1), 1); s = addRecent(s, P(2), 2);
    s = addRecent(s, { ...P(1), label: "RUE 1, PARIS" }, 3);
    expect(s.recents.map((r) => r.label)).toEqual(["RUE 1, PARIS", "Rue 2, Paris"]);
    s = addRecent(s, { label: "Autre nom", lat: P(2).lat + 0.0001, lng: P(2).lng }, 4);
    expect(s.recents).toHaveLength(2); expect(s.recents[0].label).toBe("Autre nom");
  });
  it("deux lieux à 100 m restent deux entrées", () => {
    const s = addRecent(addRecent(EMPTY_PLACES, P(1), 1), { label: "Voisin", lat: P(1).lat + 0.001, lng: P(1).lng }, 2);
    expect(s.recents).toHaveLength(2);
  });
  it("entrée invalide (coordonnées NaN, libellé vide) : ignorée", () => {
    expect(addRecent(EMPTY_PLACES, { label: "x", lat: NaN, lng: 2 }, 1)).toBe(EMPTY_PLACES);
    expect(addRecent(EMPTY_PLACES, { label: "  ", lat: 48, lng: 2 }, 1)).toBe(EMPTY_PLACES);
    expect(addRecent(EMPTY_PLACES, { label: "x", lat: 91, lng: 2 }, 1)).toBe(EMPTY_PLACES);
  });
  it("suppression d'un élément ; indice invalide : inchangé", () => {
    let s = addRecent(addRecent(EMPTY_PLACES, P(1), 1), P(2), 2);
    expect(removeRecent(s, 0).recents.map((r) => r.label)).toEqual(["Rue 1, Paris"]);
    expect(removeRecent(s, 5)).toBe(s); expect(removeRecent(s, -1)).toBe(s);
    s = removeRecent(removeRecent(s, 0), 0); expect(s.recents).toEqual([]);
  });
  it("ne modifie jamais l'ancien état", () => {
    const a = addRecent(EMPTY_PLACES, P(1), 1); const copy = JSON.stringify(a);
    addRecent(a, P(2), 2); removeRecent(a, 0); expect(JSON.stringify(a)).toBe(copy); expect(EMPTY_PLACES.recents).toEqual([]);
  });
});

describe("favoris nommés", () => {
  it("Domicile et Travail sont uniques : un nouveau remplace l'ancien", () => {
    let s = setFavorite(EMPTY_PLACES, "home", P(1)); s = setFavorite(s, "home", P(2));
    expect(s.favorites).toHaveLength(1); expect(s.favorites[0].label).toBe("Rue 2, Paris"); expect(s.favorites[0].name).toBe("Domicile");
    expect(getFavorite(s, "home")?.lat).toBe(P(2).lat); expect(getFavorite(s, "work")).toBeNull();
  });
  it("Domicile puis Travail en tête, lieux nommés ensuite, quel que soit l'ordre de création", () => {
    let s = setFavorite(EMPTY_PLACES, "custom", P(3), "Salle de sport"); s = setFavorite(s, "work", P(2)); s = setFavorite(s, "home", P(1));
    expect(s.favorites.map((f) => f.name)).toEqual(["Domicile", "Travail", "Salle de sport"]);
  });
  it("un lieu nommé exige un nom ; 24 caractères au plus ; même nom (casse ignorée) = remplacé", () => {
    expect(setFavorite(EMPTY_PLACES, "custom", P(1), "   ")).toBe(EMPTY_PLACES);
    expect(setFavorite(EMPTY_PLACES, "custom", P(1))).toBe(EMPTY_PLACES);
    const long = setFavorite(EMPTY_PLACES, "custom", P(1), "x".repeat(60));
    expect(long.favorites[0].name).toHaveLength(MAX_NAME);
    let s = setFavorite(EMPTY_PLACES, "custom", P(1), "Gym"); s = setFavorite(s, "custom", P(2), "gym");
    expect(s.favorites).toHaveLength(1); expect(s.favorites[0].label).toBe("Rue 2, Paris");
  });
  it("plafond de 12 favoris", () => {
    let s = EMPTY_PLACES; for (let i = 1; i <= 20; i++) s = setFavorite(s, "custom", P(i), `Lieu ${i}`);
    expect(s.favorites).toHaveLength(MAX_FAVORITES);
  });
  it("suppression par identifiant ; identifiant inconnu : inchangé", () => {
    const s = setFavorite(setFavorite(EMPTY_PLACES, "home", P(1)), "custom", P(2), "Gym");
    expect(removeFavorite(s, "home").favorites.map((f) => f.name)).toEqual(["Gym"]);
    expect(removeFavorite(s, "zzz")).toBe(s);
    const gym = s.favorites.find((f) => f.kind === "custom")!;
    expect(removeFavorite(s, gym.id).favorites.map((f) => f.name)).toEqual(["Domicile"]);
  });
});

describe("stockage local", () => {
  it("aller-retour : ce qui est enregistré est relu à l'identique", () => {
    const st = fakeStorage();
    let s = setFavorite(EMPTY_PLACES, "home", P(1)); s = addRecent(s, P(2), 5);
    expect(savePlaces(s, st)).toBe(true);
    expect(Object.keys(st.dump)).toEqual([PLACES_KEY]);
    expect(loadPlaces(st)).toEqual(s);
  });
  it("lecture tolérante : texte illisible, null, mauvais types, coordonnées invalides, doublons Domicile", () => {
    expect(parsePlaces("pas du json")).toEqual(EMPTY_PLACES);
    expect(parsePlaces(null)).toEqual(EMPTY_PLACES);
    expect(parsePlaces("42")).toEqual(EMPTY_PLACES);
    const bad = JSON.stringify({
      favorites: [{ kind: "home", label: "A", lat: 48, lng: 2 }, { kind: "home", label: "B", lat: 49, lng: 2 }, { kind: "custom", name: "", label: "C", lat: 48, lng: 2 }, { kind: "work", label: "D", lat: "x", lng: 2 }, null],
      recents: [{ label: "R", lat: 48, lng: 2, at: 3 }, { label: "", lat: 48, lng: 2 }, { label: "S", lat: 1000, lng: 2 }, 7],
    });
    const out = parsePlaces(bad);
    expect(out.favorites.map((f) => f.label)).toEqual(["A"]);
    expect(out.recents.map((r) => r.label)).toEqual(["R"]);
  });
  it("lecture : plafond respecté même si le fichier en contient trop", () => {
    const recents = Array.from({ length: 40 }, (_, i) => ({ label: `L${i}`, lat: 48 + i * 0.01, lng: 2, at: i }));
    expect(parsePlaces({ favorites: [], recents }).recents).toHaveLength(MAX_RECENTS);
    expect(parsePlaces({ favorites: [], recents }).recents[0].label).toBe("L39");
  });
  it("stockage absent, bloqué ou plein : aucune exception, repli vide", () => {
    expect(loadPlaces(null)).toEqual(EMPTY_PLACES);
    expect(loadPlaces({ getItem: () => { throw new Error("SecurityError"); } })).toEqual(EMPTY_PLACES);
    expect(savePlaces(EMPTY_PLACES, null)).toBe(false);
    expect(savePlaces(EMPTY_PLACES, { setItem: () => { throw new Error("QuotaExceededError"); } })).toBe(false);
  });
  it("ne garde que des données de lieu : rien d'autre n'est écrit (pas de jeton, pas d'identifiant d'utilisateur)", () => {
    const st = fakeStorage(); savePlaces(addRecent(EMPTY_PLACES, { ...P(1), subtitle: "Paris" }, 1), st);
    expect(Object.keys(JSON.parse(st.dump[PLACES_KEY]).recents[0]).sort()).toEqual(["at", "label", "lat", "lng", "subtitle"]);
  });
});
