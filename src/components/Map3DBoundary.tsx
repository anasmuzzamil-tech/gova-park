import { Component, type ReactNode } from "react";

// Si le chargement de la carte 3D échoue (fichier introuvable, erreur au rendu), on affiche le repli
// et on prévient la page pour qu'elle explique pourquoi la 3D est absente.
export class Map3DBoundary extends Component<{ fallback: ReactNode; onError: (error: unknown) => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { this.props.onError(error); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
