package com.nottorzz.eyeball.client.target;

import com.nottorzz.eyeball.Appearance;
import com.nottorzz.eyeball.client.config.ConfigManager;
import com.nottorzz.eyeball.client.config.EyeBallConfig;
import java.util.UUID;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.AbstractClientPlayer;

/**
 * Decides whether a player wears googly eyes <em>on this screen</em>.
 * <p>
 * Order of precedence:
 * <ol>
 *     <li>The main Googly Eyes switch. OFF always wins: the effect disappears.</li>
 *     <li>An explicit per-player choice from Player Selection.</li>
 *     <li>For yourself: a look forced by the server, otherwise "Apply to Myself".</li>
 *     <li>For others: "Apply to Everyone", plus looks synced from a modded server ("Show Synced Looks").</li>
 * </ol>
 * Purely client-side: it changes what you see, never what other players see.
 */
public final class TargetResolver {
	private TargetResolver() {
	}

	public static int resolve(AbstractClientPlayer player) {
		return resolve(player.getUUID(), isLocal(player.getUUID()));
	}

	public static int resolve(UUID player, boolean isSelf) {
		return resolve(player, isSelf, true);
	}

	/** Same as {@link #resolve(UUID, boolean)}, optionally ignoring the player's own override. */
	public static int resolve(UUID player, boolean isSelf, boolean useOverride) {
		EyeBallConfig config = ConfigManager.get();
		if (!config.googlyEyes) {
			return Appearance.NONE;
		}
		EyeBallConfig.PlayerOverride override = useOverride ? config.override(player) : null;
		if (override != null && override.googly != null) {
			return Appearance.of(override.googly);
		}
		int synced = SyncedLooks.get(player);
		boolean googly;
		if (isSelf) {
			googly = Appearance.forcedGoogly(synced) ? Appearance.googly(synced) : config.selfGoogly;
		} else {
			googly = config.everyoneGoogly || config.showSyncedLooks && Appearance.googly(synced);
		}
		return Appearance.of(googly);
	}

	/** The look this client shares with the server for itself (what other modded players will see). */
	public static int lookToShare() {
		EyeBallConfig config = ConfigManager.get();
		if (!config.shareMyLook || !config.googlyEyes) {
			return Appearance.NONE;
		}
		Minecraft minecraft = Minecraft.getInstance();
		UUID self = minecraft.player != null ? minecraft.player.getUUID() : null;
		EyeBallConfig.PlayerOverride override = self != null ? config.override(self) : null;
		return Appearance.of(override != null && override.googly != null ? override.googly : config.selfGoogly);
	}

	public static boolean isLocal(UUID player) {
		Minecraft minecraft = Minecraft.getInstance();
		return minecraft.player != null && minecraft.player.getUUID().equals(player);
	}
}
