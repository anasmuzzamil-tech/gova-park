import { useAuth } from "@/hooks/useAuth";

/**
 * Mode démo du serveur (aucune base branchée) : lu dans `auth.me`, dont le champ `demo` vient de `isDemoMode` côté serveur.
 * Faux sans compte connecté (en démo, le visiteur démo est toujours connecté).
 */
export function useDemoMode(): boolean {
  const { user } = useAuth();
  return user?.demo === true;
}
