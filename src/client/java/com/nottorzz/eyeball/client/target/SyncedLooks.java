package com.nottorzz.eyeball.client.target;

import com.nottorzz.eyeball.network.AppearanceSyncPayload;
import com.nottorzz.eyeball.network.SelfAppearancePayload;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.minecraft.client.Minecraft;

/**
 * Client copy of the looks the server shares (players' own choices and operator-forced looks).
 * Only filled when the server runs EyeBall. Accessed on the client thread only.
 */
public final class SyncedLooks {
	private static final Map<UUID, Integer> LOOKS = new HashMap<>();

	private SyncedLooks() {
	}

	public static void apply(AppearanceSyncPayload payload) {
		if (payload.replaceAll()) {
			LOOKS.clear();
		}
		for (AppearanceSyncPayload.Entry entry : payload.entries()) {
			int flags = entry.flags() & 0xFF;
			if (flags == 0) {
				LOOKS.remove(entry.player());
			} else {
				LOOKS.put(entry.player(), flags);
			}
		}
	}

	public static int get(UUID player) {
		return LOOKS.getOrDefault(player, 0);
	}

	public static void clear() {
		LOOKS.clear();
	}

	/** True when connected to a server that has EyeBall installed (so looks are shared). */
	public static boolean serverHasMod() {
		Minecraft minecraft = Minecraft.getInstance();
		if (minecraft.getConnection() == null) {
			return false;
		}
		try {
			return ClientPlayNetworking.canSend(SelfAppearancePayload.TYPE);
		} catch (IllegalStateException e) {
			return false;
		}
	}
}
