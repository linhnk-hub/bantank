/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import Phaser from 'phaser';

export const ART_SYSTEM_MANIFEST_PATH = 'assets/manifests/asset_manifest.json' as const;
export const ART_SYSTEM_MANIFEST_CACHE_KEY = 'art_system_v1_1_manifest' as const;
export const ART_SYSTEM_PRELOAD_SCENE_KEY = 'ArtSystemPreloadScene' as const;
export const EXPECTED_ART_SYSTEM_ASSET_COUNT = 51 as const;

export const REQUIRED_EAGLE_ALIASES = [
  'tile_9_center',
  'tile_eagle_center',
  'tile_eagle_ruined',
] as const;

export interface ArtSystemManifestAsset {
  readonly id: string;
  readonly phaserKey: string;
  readonly aliases?: readonly string[];
  readonly category: string;
  readonly group: string;
  readonly direction?: string;
  readonly state?: string;
  readonly variant?: string;
  readonly bitMask?: number;
  readonly path: string;
  readonly width: number;
  readonly height: number;
  readonly logicalWidth: number;
  readonly logicalHeight: number;
  readonly projectionScale: number;
  readonly origin: readonly [number, number];
}

export interface ArtSystemManifest {
  readonly schemaVersion: string;
  readonly artSystem: string;
  readonly phase: string;
  readonly projectionScale: number;
  readonly logicalTilePx: number;
  readonly sourceTilePx: number;
  readonly quarterTilePx: number;
  readonly totalResourceGroups: number;
  readonly totalPngFiles: number;
  readonly coopAiSpriteMapping?: {
    readonly mode: string;
    readonly allyTankGroup: string;
    readonly phaserKeyPrefix: string;
  };
  readonly assets: readonly ArtSystemManifestAsset[];
}

export interface ManifestAliasBinding {
  readonly aliasKey: string;
  readonly sourcePhaserKey: string;
  readonly sourcePath: string;
}

export interface ManifestValidationResult {
  readonly valid: boolean;
  readonly errors: string[];
  readonly warnings: string[];
  readonly entries: ArtSystemManifestAsset[];
  readonly aliasBindings: ManifestAliasBinding[];
  readonly duplicateKeys: string[];
  readonly invalidPaths: string[];
  readonly missingRequiredAliases: string[];
}

export interface AliasRegistrationSummary {
  readonly registered: string[];
  readonly skippedExisting: string[];
  readonly missingSource: string[];
}

/**
 * Resolves the active Vite base path (defaults to './' matching vite.config.ts).
 */
export function getViteBaseUrl(): string {
  const metaEnv =
    typeof import.meta !== 'undefined' && 'env' in import.meta
      ? (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env
      : undefined;
  const rawBase = typeof metaEnv?.BASE_URL === 'string' && metaEnv.BASE_URL.length > 0
    ? metaEnv.BASE_URL
    : './';
  return rawBase.endsWith('/') ? rawBase : `${rawBase}/`;
}

/**
 * Validates that a manifest-relative public asset path is safe and well-formed.
 */
export function isValidRelativeAssetPath(assetPath: unknown): assetPath is string {
  if (typeof assetPath !== 'string') return false;
  const trimmed = assetPath.trim();
  if (trimmed.length === 0) return false;
  if (trimmed.startsWith('/') || trimmed.startsWith('\\')) return false;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return false;
  if (trimmed.includes('..') || trimmed.includes('\\')) return false;
  return /^assets\/[a-zA-Z0-9._/-]+\.(png|json)$/.test(trimmed);
}

/**
 * Resolves a manifest-relative path against Vite's configured relative base ('./').
 */
export function resolveArtAssetUrl(
  relativePath: string,
  baseUrl: string = getViteBaseUrl()
): string {
  if (!isValidRelativeAssetPath(relativePath)) {
    throw new Error(`[ArtSystemAssetLoader] Invalid relative asset path: "${String(relativePath)}"`);
  }
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${normalizedBase}${relativePath}`;
}

/**
 * Validates the parsed Art System V1.1 manifest:
 * - Verifies asset list structure and count
 * - Verifies every asset path is a valid relative PNG path
 * - Verifies all primary texture keys and aliases are globally unique
 * - Verifies required Eagle compatibility aliases are declared
 */
export function validateArtSystemManifest(raw: unknown): ManifestValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const entries: ArtSystemManifestAsset[] = [];
  const aliasBindings: ManifestAliasBinding[] = [];
  const duplicateKeys: string[] = [];
  const invalidPaths: string[] = [];

  if (!raw || typeof raw !== 'object') {
    errors.push('Manifest payload is missing or not a JSON object.');
    return {
      valid: false,
      errors,
      warnings,
      entries,
      aliasBindings,
      duplicateKeys,
      invalidPaths,
      missingRequiredAliases: [...REQUIRED_EAGLE_ALIASES],
    };
  }

  const manifest = raw as Partial<ArtSystemManifest>;
  if (!Array.isArray(manifest.assets) || manifest.assets.length === 0) {
    errors.push('Manifest "assets" must be a non-empty array.');
    return {
      valid: false,
      errors,
      warnings,
      entries,
      aliasBindings,
      duplicateKeys,
      invalidPaths,
      missingRequiredAliases: [...REQUIRED_EAGLE_ALIASES],
    };
  }

  if (
    typeof manifest.totalPngFiles === 'number' &&
    manifest.totalPngFiles !== manifest.assets.length
  ) {
    warnings.push(
      `Manifest totalPngFiles (${manifest.totalPngFiles}) does not match assets.length (${manifest.assets.length}).`
    );
  }

  if (manifest.assets.length !== EXPECTED_ART_SYSTEM_ASSET_COUNT) {
    warnings.push(
      `Expected ${EXPECTED_ART_SYSTEM_ASSET_COUNT} Art System V1.1 PNG assets, found ${manifest.assets.length}.`
    );
  }

  const seenTextureKeys = new Set<string>();
  const seenIds = new Set<string>();
  const declaredAliases = new Set<string>();

  for (let i = 0; i < manifest.assets.length; i++) {
    const asset = manifest.assets[i] as Partial<ArtSystemManifestAsset> | null | undefined;
    if (!asset || typeof asset !== 'object') {
      errors.push(`Manifest entry at index ${i} is not a valid object.`);
      continue;
    }

    const id = typeof asset.id === 'string' ? asset.id.trim() : '';
    const phaserKey = typeof asset.phaserKey === 'string' ? asset.phaserKey.trim() : '';
    const path = typeof asset.path === 'string' ? asset.path.trim() : '';

    if (!id) {
      errors.push(`Manifest entry at index ${i} is missing a valid "id".`);
      continue;
    }

    if (seenIds.has(id)) {
      errors.push(`Duplicate manifest asset id "${id}".`);
    } else {
      seenIds.add(id);
    }

    if (!phaserKey) {
      errors.push(`Manifest entry "${id}" is missing a valid "phaserKey".`);
      continue;
    }

    if (!isValidRelativeAssetPath(path) || !path.endsWith('.png')) {
      invalidPaths.push(path || `<empty:${id}>`);
      errors.push(`Manifest entry "${id}" has invalid PNG asset path "${path}".`);
      continue;
    }

    if (seenTextureKeys.has(phaserKey)) {
      duplicateKeys.push(phaserKey);
      errors.push(`Duplicate texture key "${phaserKey}" detected in manifest entry "${id}".`);
      continue;
    }

    seenTextureKeys.add(phaserKey);
    entries.push(asset as ArtSystemManifestAsset);

    if (Array.isArray(asset.aliases)) {
      for (const rawAlias of asset.aliases) {
        const aliasKey = typeof rawAlias === 'string' ? rawAlias.trim() : '';
        if (!aliasKey) {
          errors.push(`Manifest entry "${id}" contains an empty alias key.`);
          continue;
        }
        if (seenTextureKeys.has(aliasKey)) {
          duplicateKeys.push(aliasKey);
          errors.push(
            `Alias key "${aliasKey}" on "${id}" conflicts with an existing texture key or alias.`
          );
          continue;
        }
        seenTextureKeys.add(aliasKey);
        declaredAliases.add(aliasKey);
        aliasBindings.push({
          aliasKey,
          sourcePhaserKey: phaserKey,
          sourcePath: path,
        });
      }
    }
  }

  const missingRequiredAliases = REQUIRED_EAGLE_ALIASES.filter(
    (alias) => !declaredAliases.has(alias)
  );
  if (missingRequiredAliases.length > 0) {
    errors.push(
      `Manifest is missing required Eagle compatibility aliases: ${missingRequiredAliases.join(', ')}.`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    entries,
    aliasBindings,
    duplicateKeys,
    invalidPaths,
    missingRequiredAliases,
  };
}

/**
 * Registers compatibility aliases (e.g. tile_9_center, tile_eagle_center, tile_eagle_ruined)
 * from already-loaded primary PNG textures without overwriting existing keys or refetching files.
 */
export function registerEagleCompatibilityAliases(
  scene: Phaser.Scene,
  aliasBindings: readonly ManifestAliasBinding[]
): AliasRegistrationSummary {
  const registered: string[] = [];
  const skippedExisting: string[] = [];
  const missingSource: string[] = [];
  const processedAliases = new Set<string>();

  for (const binding of aliasBindings) {
    if (processedAliases.has(binding.aliasKey)) {
      continue;
    }
    processedAliases.add(binding.aliasKey);

    if (scene.textures.exists(binding.aliasKey)) {
      skippedExisting.push(binding.aliasKey);
      continue;
    }

    if (!scene.textures.exists(binding.sourcePhaserKey)) {
      missingSource.push(binding.aliasKey);
      console.error(
        `[ArtSystemAssetLoader] Cannot register alias "${binding.aliasKey}": primary texture "${binding.sourcePhaserKey}" is not loaded.`
      );
      continue;
    }

    const sourceTexture = scene.textures.get(binding.sourcePhaserKey);
    if (!sourceTexture || sourceTexture.key === '__MISSING') {
      missingSource.push(binding.aliasKey);
      console.error(
        `[ArtSystemAssetLoader] Cannot register alias "${binding.aliasKey}": primary texture "${binding.sourcePhaserKey}" resolved to __MISSING.`
      );
      continue;
    }

    const sourceImage = sourceTexture.getSourceImage();
    let added: Phaser.Textures.Texture | null = null;

    if (
      sourceImage &&
      typeof HTMLImageElement !== 'undefined' &&
      sourceImage instanceof HTMLImageElement
    ) {
      added = scene.textures.addImage(binding.aliasKey, sourceImage);
    } else if (
      sourceImage &&
      typeof HTMLCanvasElement !== 'undefined' &&
      sourceImage instanceof HTMLCanvasElement
    ) {
      added = scene.textures.addCanvas(binding.aliasKey, sourceImage);
    }

    if (added) {
      registered.push(binding.aliasKey);
    } else {
      missingSource.push(binding.aliasKey);
      console.error(
        `[ArtSystemAssetLoader] Failed to register alias "${binding.aliasKey}" from primary texture "${binding.sourcePhaserKey}".`
      );
    }
  }

  return { registered, skippedExisting, missingSource };
}

/**
 * Loads the Art System V1.1 manifest and queues all 51 PNG assets during Phaser's `preload()` phase.
 * Existing textures are never overwritten; duplicate keys are never queued.
 * Any missing or failed PNGs are logged clearly and seamlessly fall back to `generateTileTextures()`.
 */
export function preloadArtSystemAssets(scene: Phaser.Scene): void {
  const queuedKeys = new Set<string>();
  const failedAssets: Array<{ key: string; type: string; url: string }> = [];
  let pendingAliasBindings: ManifestAliasBinding[] = [];
  let manifestLoaded = false;

  const manifestEventName = `filecomplete-json-${ART_SYSTEM_MANIFEST_CACHE_KEY}`;

  const onFileLoadError = (file: Phaser.Loader.File): void => {
    const key = file?.key ?? 'unknown';
    const type = file?.type ?? 'unknown';
    const url = String(file?.src ?? file?.url ?? 'unknown');
    failedAssets.push({ key, type, url });
    console.error(
      `[ArtSystemAssetLoader] Failed to load asset (key="${key}", type="${type}", url="${url}"). Procedural fallback will be used if available.`
    );
  };

  const enqueueManifestAssets = (manifestData: unknown): number => {
    manifestLoaded = true;
    const validation = validateArtSystemManifest(manifestData);

    for (const warning of validation.warnings) {
      console.warn(`[ArtSystemAssetLoader] Manifest warning: ${warning}`);
    }
    for (const error of validation.errors) {
      console.error(`[ArtSystemAssetLoader] Manifest validation error: ${error}`);
    }

    pendingAliasBindings = validation.aliasBindings;

    let newlyQueuedCount = 0;
    for (const entry of validation.entries) {
      if (scene.textures.exists(entry.phaserKey)) {
        continue;
      }
      if (queuedKeys.has(entry.phaserKey)) {
        continue;
      }

      try {
        const resolvedUrl = resolveArtAssetUrl(entry.path);
        queuedKeys.add(entry.phaserKey);
        scene.load.image(entry.phaserKey, resolvedUrl);
        newlyQueuedCount++;
      } catch (err) {
        console.error(
          `[ArtSystemAssetLoader] Skipping asset "${entry.id}" (key="${entry.phaserKey}") due to invalid path:`,
          err
        );
      }
    }

    return newlyQueuedCount;
  };

  const cleanupListeners = (): void => {
    scene.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, onFileLoadError);
    scene.load.off(manifestEventName, onManifestLoaded);
    scene.load.off(Phaser.Loader.Events.COMPLETE, onLoadComplete);
  };

  const onManifestLoaded = (_key: string, _type: string, data: unknown): void => {
    enqueueManifestAssets(data);
  };

  const onLoadComplete = (): void => {
    if (!manifestLoaded) {
      console.error(
        `[ArtSystemAssetLoader] Asset manifest "${ART_SYSTEM_MANIFEST_PATH}" did not load. Falling back to procedural textures.`
      );
    } else if (pendingAliasBindings.length > 0) {
      registerEagleCompatibilityAliases(scene, pendingAliasBindings);
    }

    if (failedAssets.length > 0) {
      console.error(
        `[ArtSystemAssetLoader] Completed preload with ${failedAssets.length} failed asset(s): ${failedAssets
          .map((item) => item.key)
          .join(', ')}.`
      );
    }

    cleanupListeners();
  };

  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanupListeners);
  scene.events.once(Phaser.Scenes.Events.DESTROY, cleanupListeners);

  scene.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, onFileLoadError);

  if (scene.cache.json.exists(ART_SYSTEM_MANIFEST_CACHE_KEY)) {
    const cachedManifest = scene.cache.json.get(ART_SYSTEM_MANIFEST_CACHE_KEY);
    const queuedCount = enqueueManifestAssets(cachedManifest);
    if (queuedCount > 0) {
      scene.load.once(Phaser.Loader.Events.COMPLETE, onLoadComplete);
    } else {
      registerEagleCompatibilityAliases(scene, pendingAliasBindings);
      cleanupListeners();
    }
    return;
  }

  scene.load.once(manifestEventName, onManifestLoaded);
  scene.load.once(Phaser.Loader.Events.COMPLETE, onLoadComplete);

  const manifestUrl = resolveArtAssetUrl(ART_SYSTEM_MANIFEST_PATH);
  scene.load.json(ART_SYSTEM_MANIFEST_CACHE_KEY, manifestUrl);
}

/**
 * Dedicated Phaser preload boot scene that loads all approved Art System V1.1 PNG assets
 * inside Phaser's official `preload()` lifecycle before starting the target gameplay or inspector scene.
 */
export class ArtSystemPreloadScene extends Phaser.Scene {
  private readonly nextSceneKey: string;

  constructor(nextSceneKey: string) {
    super({ key: ART_SYSTEM_PRELOAD_SCENE_KEY });
    this.nextSceneKey = nextSceneKey;
  }

  preload(): void {
    preloadArtSystemAssets(this);
  }

  create(): void {
    this.scene.start(this.nextSceneKey);
  }
}
