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
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * Looks forced by operators through {@code /eyeball googly|elmo <targets> on|off}. They override a
 * player's own choice and are saved with the world so they survive server restarts.
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

	public static ForcedLookStore load(Path file) {
		ForcedLookStore store = new ForcedLookStore(file);
		if (!Files.isRegularFile(file)) {
			return store;
		}
		try (Reader reader = Files.newBufferedReader(file, StandardCharsets.UTF_8)) {
			Map<String, JsonObject> raw = GSON.fromJson(reader, FILE_TYPE);
			if (raw != null) {
				for (Map.Entry<String, JsonObject> entry : raw.entrySet()) {
					try {
						UUID id = UUID.fromString(entry.getKey());
						JsonObject json = entry.getValue();
						Boolean googly = json.has("googly") && !json.get("googly").isJsonNull() ? json.get("googly").getAsBoolean() : null;
						Boolean elmo = json.has("elmo") && !json.get("elmo").isJsonNull() ? json.get("elmo").getAsBoolean() : null;
						String name = json.has("name") ? json.get("name").getAsString() : "";
						if (googly != null || elmo != null) {
							store.forced.put(id, new Forced(googly, elmo, name));
						}
					} catch (IllegalArgumentException | IllegalStateException ignored) {
						EyeBallMod.LOGGER.warn("Ignoring malformed forced look entry '{}'", entry.getKey());
					}
				}
			}
		} catch (IOException | JsonParseException e) {
			EyeBallMod.LOGGER.warn("Could not read forced looks from {}", file, e);
		}
		return store;
	}

	/** Applies forced overrides on top of a player's self-chosen flags. */
	public int apply(UUID player, int selfFlags) {
		Forced f = this.forced.get(player);
		if (f == null) {
			return selfFlags;
		}
		boolean googly = f.googly != null ? f.googly : Appearance.googly(selfFlags);
		boolean elmo = f.elmo != null ? f.elmo : Appearance.elmo(selfFlags);
		return Appearance.of(googly, elmo);
	}

	/** Effective flags plus {@link Appearance#FORCED_GOOGLY}/{@link Appearance#FORCED_ELMO} bits, as sent to clients. */
	public int syncFlags(UUID player, int selfFlags) {
		int flags = this.apply(player, selfFlags);
		Forced f = this.forced.get(player);
		if (f != null) {
			if (f.googly != null) {
				flags |= Appearance.FORCED_GOOGLY;
			}
			if (f.elmo != null) {
				flags |= Appearance.FORCED_ELMO;
			}
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
	 * Sets or clears ({@code value == null}) a forced effect.
	 *
	 * @return true if something changed
	 */
	public boolean set(UUID player, String name, LookEffect effect, @Nullable Boolean value) {
		Forced old = this.forced.get(player);
		Boolean googly = old != null ? old.googly : null;
		Boolean elmo = old != null ? old.elmo : null;
		if (effect == LookEffect.GOOGLY) {
			googly = value;
		} else {
			elmo = value;
		}
		Forced updated = googly == null && elmo == null ? null : new Forced(googly, elmo, name);
		if (java.util.Objects.equals(old, updated)) {
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
			if (entry.getValue().googly != null) {
				json.addProperty("googly", entry.getValue().googly);
			}
			if (entry.getValue().elmo != null) {
				json.addProperty("elmo", entry.getValue().elmo);
			}
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

	public enum LookEffect {
		GOOGLY,
		ELMO
	}

	public record Forced(@Nullable Boolean googly, @Nullable Boolean elmo, String name) {
	}
}
