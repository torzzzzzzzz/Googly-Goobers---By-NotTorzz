package com.nottorzz.eyeball.server;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonObject;
import com.google.gson.JsonParseException;
import com.google.gson.reflect.TypeToken;
import com.nottorzz.eyeball.Appearance;
import com.nottorzz.eyeball.EyeBallMod;
import java.io.IOException;
import java.io.Reader;
import java.io.Writer;
import java.lang.reflect.Type;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * Googly eyes forced on or off by operators through {@code /googlygoobers eyes <targets> on|off}.
 * They override a player's own choice and are saved with the world so they survive server restarts.
 */
public final class ForcedLookStore {
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
	private static final Type FILE_TYPE = new TypeToken<Map<String, JsonObject>>() {
	}.getType();

	private final Map<UUID, Forced> forced = new LinkedHashMap<>();
	private final @Nullable Path file;

	private ForcedLookStore(@Nullable Path file) {
		this.file = file;
	}

	public static ForcedLookStore inMemory() {
		return new ForcedLookStore(null);
	}

	/**
	 * Loads {@code file}. When it doesn't exist yet, {@code legacyFile} (the name used by
	 * pre-release builds) is read instead, and the looks are saved under the new name from then on.
	 */
	public static ForcedLookStore load(Path file, @Nullable Path legacyFile) {
		ForcedLookStore store = new ForcedLookStore(file);
		Path source = file;
		if (!Files.isRegularFile(file) && legacyFile != null && Files.isRegularFile(legacyFile)) {
			source = legacyFile;
		}
		if (!Files.isRegularFile(source)) {
			return store;
		}
		try (Reader reader = Files.newBufferedReader(source, StandardCharsets.UTF_8)) {
			Map<String, JsonObject> raw = GSON.fromJson(reader, FILE_TYPE);
			if (raw != null) {
				for (Map.Entry<String, JsonObject> entry : raw.entrySet()) {
					try {
						UUID id = UUID.fromString(entry.getKey());
						JsonObject json = entry.getValue();
						String name = json.has("name") ? json.get("name").getAsString() : "";
						if (json.has("googly") && !json.get("googly").isJsonNull()) {
							store.forced.put(id, new Forced(json.get("googly").getAsBoolean(), name));
						}
					} catch (IllegalArgumentException | IllegalStateException | UnsupportedOperationException ignored) {
						EyeBallMod.LOGGER.warn("Ignoring malformed forced look entry '{}'", entry.getKey());
					}
				}
			}
		} catch (IOException | JsonParseException e) {
			EyeBallMod.LOGGER.warn("Could not read forced looks from {}", source, e);
		}
		if (source != file) {
			store.save();
			try {
				Files.deleteIfExists(source);
			} catch (IOException e) {
				EyeBallMod.LOGGER.warn("Could not remove the old forced looks file {}", source, e);
			}
		}
		return store;
	}

	/** Applies a forced override on top of a player's self-chosen flags. */
	public int apply(UUID player, int selfFlags) {
		Forced f = this.forced.get(player);
		return f == null ? selfFlags & Appearance.LOOK_MASK : Appearance.of(f.googly);
	}

	/** Effective flags plus the {@link Appearance#FORCED_GOOGLY} bit, as sent to clients. */
	public int syncFlags(UUID player, int selfFlags) {
		int flags = this.apply(player, selfFlags);
		if (this.forced.containsKey(player)) {
			flags |= Appearance.FORCED_GOOGLY;
		}
		return flags;
	}

	public @Nullable Forced get(UUID player) {
		return this.forced.get(player);
	}

	public Map<UUID, Forced> all() {
		return this.forced;
	}

	/**
	 * Forces googly eyes on or off, or clears the override ({@code value == null}).
	 *
	 * @return true if something changed
	 */
	public boolean set(UUID player, String name, @Nullable Boolean value) {
		Forced old = this.forced.get(player);
		Forced updated = value == null ? null : new Forced(value, name);
		if (Objects.equals(old, updated)) {
			return false;
		}
		if (updated == null) {
			this.forced.remove(player);
		} else {
			this.forced.put(player, updated);
		}
		this.save();
		return true;
	}

	public void save() {
		if (this.file == null) {
			return;
		}
		Map<String, JsonObject> raw = new LinkedHashMap<>();
		for (Map.Entry<UUID, Forced> entry : this.forced.entrySet()) {
			JsonObject json = new JsonObject();
			json.addProperty("name", entry.getValue().name);
			json.addProperty("googly", entry.getValue().googly);
			raw.put(entry.getKey().toString(), json);
		}
		try {
			Files.createDirectories(this.file.getParent());
			Path tmp = this.file.resolveSibling(this.file.getFileName() + ".tmp");
			try (Writer writer = Files.newBufferedWriter(tmp, StandardCharsets.UTF_8)) {
				GSON.toJson(raw, writer);
			}
			Files.move(tmp, this.file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
		} catch (IOException e) {
			EyeBallMod.LOGGER.warn("Could not save forced looks to {}", this.file, e);
		}
	}

	public record Forced(boolean googly, String name) {
	}
}
