package com.nottorzz.eyeball.client.config;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonParseException;
import com.nottorzz.eyeball.EyeBallMod;
import java.io.IOException;
import java.io.Reader;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;
import net.fabricmc.loader.api.FabricLoader;

/**
 * Loads and saves {@link EyeBallConfig} as JSON in the game's config folder, so settings survive
 * restarts. The config object is mutated in place, so every system always sees current values.
 */
public final class ConfigManager {
	public static final String FILE_NAME = "eyeball.json";
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().serializeNulls().create();
	private static final EyeBallConfig CONFIG = EyeBallConfig.defaults();
	private static final List<Runnable> LISTENERS = new ArrayList<>();
	private static Path path = FabricLoader.getInstance().getConfigDir().resolve(FILE_NAME);

	private ConfigManager() {
	}

	public static EyeBallConfig get() {
		return CONFIG;
	}

	public static Path path() {
		return path;
	}

	/** Runs whenever settings change (used to share your look with the server). */
	public static void addListener(Runnable listener) {
		LISTENERS.add(listener);
	}

	public static void load() {
		EyeBallConfig loaded = readFrom(path);
		if (loaded == null) {
			CONFIG.copyFrom(EyeBallConfig.defaults());
			save();
		} else {
			CONFIG.copyFrom(loaded);
		}
		notifyChanged();
	}

	/** Reads a config file; returns null when missing, and backs up and ignores a broken file. */
	public static EyeBallConfig readFrom(Path file) {
		if (!Files.isRegularFile(file)) {
			return null;
		}
		try (Reader reader = Files.newBufferedReader(file, StandardCharsets.UTF_8)) {
			EyeBallConfig parsed = GSON.fromJson(reader, EyeBallConfig.class);
			if (parsed == null) {
				return null;
			}
			parsed.sanitize();
			return parsed;
		} catch (IOException | JsonParseException e) {
			EyeBallMod.LOGGER.warn("Config file {} is unreadable, using defaults (a backup was kept)", file, e);
			try {
				Files.copy(file, file.resolveSibling(file.getFileName() + ".broken"), StandardCopyOption.REPLACE_EXISTING);
			} catch (IOException ignored) {
			}
			return null;
		}
	}

	public static void save() {
		CONFIG.sanitize();
		try {
			Files.createDirectories(path.getParent());
			Path tmp = path.resolveSibling(FILE_NAME + ".tmp");
			try (Writer writer = Files.newBufferedWriter(tmp, StandardCharsets.UTF_8)) {
				GSON.toJson(CONFIG, writer);
			}
			try {
				Files.move(tmp, path, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
			} catch (AtomicMoveNotSupportedException e) {
				Files.move(tmp, path, StandardCopyOption.REPLACE_EXISTING);
			}
		} catch (IOException e) {
			EyeBallMod.LOGGER.error("Could not save EyeBall settings to {}", path, e);
		}
	}

	/** Call after changing a setting in memory; it applies immediately. */
	public static void notifyChanged() {
		for (Runnable listener : LISTENERS) {
			listener.run();
		}
	}

	public static void resetToDefaults() {
		CONFIG.copyFrom(EyeBallConfig.defaults());
		notifyChanged();
	}

	/** For tests: point the manager at another file. */
	public static void setPathForTesting(Path newPath) {
		path = newPath;
	}
}
