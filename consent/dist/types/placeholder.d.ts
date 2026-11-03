import type { NormalizedConfig } from './config';
export interface PlaceholderDeps {
    config: NormalizedConfig;
    isAccepted(serviceId: string): boolean;
    accept(serviceId: string): void;
    showPreferences(): void;
}
/** Gibt freigegebene Dienste frei und zeigt für alle anderen einen Platzhalter. Mehrfach aufrufbar. */
export declare function scanPlaceholders(root: ParentNode, deps: PlaceholderDeps): void;
/** Warnt vor Skripten, die nie laufen würden oder an der Konfiguration vorbei freigegeben würden. */
export declare function lintScripts(root: ParentNode, config: NormalizedConfig): void;
