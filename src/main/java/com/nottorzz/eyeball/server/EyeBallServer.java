package com.nottorzz.eyeball.server;

import com.nottorzz.eyeball.Appearance;
import com.nottorzz.eyeball.EyeBallMod;
import com.nottorzz.eyeball.Expression;
import com.nottorzz.eyeball.FaceEventKind;
import com.nottorzz.eyeball.network.AppearanceSyncPayload;
import com.nottorzz.eyeball.network.FaceEventPayload;
import com.nottorzz.eyeball.network.PlayerFaceEventPayload;
import com.nottorzz.eyeball.network.SelfAppearancePayload;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.networking.v1.PlayerLookup;
import net.fabricmc.fabric.api.networking.v1.ServerPlayConnectionEvents;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.level.storage.LevelResource;
import org.jspecify.annotations.Nullable;

/**
 * Server half of the multiplayer synchronisation. Only active when the mod is installed on the
 * server (or in singleplayer, where the integrated server runs it).
 * <ul>
 *     <li>Remembers the look each modded player chose for themselves and shares it with other modded players.</li>
 *     <li>Applies looks forced by operators ({@code /googlygoobers}), persisted per world.</li>
 *     <li>Relays talk / expression events to nearby modded players, with rate limiting.</li>
 * </ul>
 * Players without the mod are never sent anything, and cannot see the effects.
 * All state is only touched from the server thread.
 */
public final class EyeBallServer {
	private static final String FORCED_FILE = "googlygoobers_forced_looks.json";
	/** File name used by pre-release builds; read once and migrated. */
	private static final String LEGACY_FORCED_FILE = "eyeball_forced_looks.json";
	private static final int MAX_EVENT_TICKS = 200;
	private static final double EVENT_TOKENS_PER_TICK = 3.0 / 20.0;
	private static final double EVENT_BUCKET_SIZE = 6.0;

	private static final Map<UUID, Integer> SELF_LOOKS = new HashMap<>();
	private static final Map<UUID, double[]> EVENT_BUCKETS = new HashMap<>();
	private static ForcedLookStore forced = ForcedLookStore.inMemory();
	private static @Nullable MinecraftServer currentServer;

	private EyeBallServer() {
	}

	public static void init() {
		ServerLifecycleEvents.SERVER_STARTED.register(server -> {
			currentServer = server;
			Path worldDir = server.getWorldPath(LevelResource.ROOT);
			forced = ForcedLookStore.load(worldDir.resolve(FORCED_FILE), worldDir.resolve(LEGACY_FORCED_FILE));
		});
		ServerLifecycleEvents.SERVER_STOPPED.register(server -> {
			forced.save();
			currentServer = null;
			forced = ForcedLookStore.inMemory();
			SELF_LOOKS.clear();
			EVENT_BUCKETS.clear();
		});
		ServerPlayConnectionEvents.JOIN.register((handler, sender, server) -> onJoin(handler.player));
		ServerPlayConnectionEvents.DISCONNECT.register((handler, server) -> onLeave(handler.player));
		ServerPlayNetworking.registerGlobalReceiver(SelfAppearancePayload.TYPE,
			(payload, context) -> setSelfLook(context.player(), payload.flags() & Appearance.LOOK_MASK));
		ServerPlayNetworking.registerGlobalReceiver(FaceEventPayload.TYPE,
			(payload, context) -> relayFromClient(context.player(), payload));
		CommandRegistrationCallback.EVENT.register(EyeBallCommands::register);
	}

	public static ForcedLookStore forcedLooks() {
		return forced;
	}

	public static int selfLook(UUID player) {
		return SELF_LOOKS.getOrDefault(player, Appearance.NONE);
	}

	/** The look other modded players should see on this player. */
	public static int effectiveLook(UUID player) {
		return forced.apply(player, selfLook(player));
	}

	/** What is sent to clients: the effective look plus which parts were forced. */
	public static int syncFlags(UUID player) {
		return forced.syncFlags(player, selfLook(player));
	}

	public static boolean hasMod(ServerPlayer player) {
		return ServerPlayNetworking.canSend(player, AppearanceSyncPayload.TYPE);
	}

	private static void onJoin(ServerPlayer player) {
		MinecraftServer server = player.level().getServer();
		if (hasMod(player)) {
			List<AppearanceSyncPayload.Entry> entries = new ArrayList<>();
			for (ServerPlayer online : PlayerLookup.all(server)) {
				int flags = syncFlags(online.getUUID());
				if (flags != Appearance.NONE) {
					entries.add(new AppearanceSyncPayload.Entry(online.getUUID(), (byte) flags));
				}
			}
			ServerPlayNetworking.send(player, new AppearanceSyncPayload(true, entries));
		}
		// Others learn about looks forced on the newcomer straight away.
		if (syncFlags(player.getUUID()) != Appearance.NONE) {
			broadcastLook(server, player.getUUID());
		}
	}

	private static void onLeave(ServerPlayer player) {
		EVENT_BUCKETS.remove(player.getUUID());
		if (SELF_LOOKS.remove(player.getUUID()) != null) {
			MinecraftServer server = player.level().getServer();
			broadcastLook(server, player.getUUID());
		}
	}

	static void setSelfLook(ServerPlayer player, int flags) {
		Integer previous = SELF_LOOKS.put(player.getUUID(), flags);
		if (previous == null || previous != flags) {
			broadcastLook(player.level().getServer(), player.getUUID());
		}
	}

	/** Sends one player's current look to every modded player (including that player). */
	public static void broadcastLook(MinecraftServer server, UUID player) {
		AppearanceSyncPayload payload = new AppearanceSyncPayload(false,
			List.of(new AppearanceSyncPayload.Entry(player, (byte) syncFlags(player))));
		for (ServerPlayer online : PlayerLookup.all(server)) {
			if (hasMod(online)) {
				ServerPlayNetworking.send(online, payload);
			}
		}
	}

	private static void relayFromClient(ServerPlayer sender, FaceEventPayload payload) {
		if (!consumeEventToken(sender)) {
			return;
		}
		FaceEventKind kind = FaceEventKind.byId(payload.kind());
		if (kind == FaceEventKind.REACTION) {
			// Hit reactions come from real damage (seen by every client) or operators, never from clients.
			return;
		}
		Expression expression = Expression.byId(payload.expression());
		if (expression == Expression.DIZZY) {
			expression = Expression.NEUTRAL;
		}
		int ticks = Math.clamp(payload.ticks(), 1, MAX_EVENT_TICKS);
		relay(sender, kind, expression, ticks, false);
	}

	/**
	 * Sends a face event about {@code subject} to every modded player that can see them.
	 *
	 * @param includeSubject also send it to the subject (used for command-triggered events)
	 */
	public static int relay(ServerPlayer subject, FaceEventKind kind, Expression expression, int ticks, boolean includeSubject) {
		PlayerFaceEventPayload out = new PlayerFaceEventPayload(subject.getUUID(), (byte) kind.ordinal(),
			(byte) expression.id, (short) Math.clamp(ticks, 1, MAX_EVENT_TICKS));
		int sent = 0;
		for (ServerPlayer viewer : PlayerLookup.tracking(subject)) {
			if (viewer != subject && ServerPlayNetworking.canSend(viewer, PlayerFaceEventPayload.TYPE)) {
				ServerPlayNetworking.send(viewer, out);
				sent++;
			}
		}
		if (includeSubject && ServerPlayNetworking.canSend(subject, PlayerFaceEventPayload.TYPE)) {
			ServerPlayNetworking.send(subject, out);
			sent++;
		}
		return sent;
	}

	private static boolean consumeEventToken(ServerPlayer player) {
		long now = player.level().getServer().getTickCount();
		double[] bucket = EVENT_BUCKETS.computeIfAbsent(player.getUUID(), id -> new double[]{EVENT_BUCKET_SIZE, now});
		bucket[0] = Math.min(EVENT_BUCKET_SIZE, bucket[0] + (now - bucket[1]) * EVENT_TOKENS_PER_TICK);
		bucket[1] = now;
		if (bucket[0] < 1.0) {
			EyeBallMod.LOGGER.debug("Dropping face event from {} (rate limited)", player.getGameProfile().name());
			return false;
		}
		bucket[0] -= 1.0;
		return true;
	}

	static @Nullable MinecraftServer server() {
		return currentServer;
	}
}
