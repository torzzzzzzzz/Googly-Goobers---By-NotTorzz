package com.nottorzz.eyeball.client.target;

import com.nottorzz.eyeball.Appearance;
import com.nottorzz.eyeball.client.config.ConfigManager;
import com.nottorzz.eyeball.client.config.EyeBallConfig;
import java.util.UUID;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.AbstractClientPlayer;

/**
 * Decides which effects a player wears <em>on this screen</em>.
 * <p>
 * Order of precedence, per effect:
 * <ol>
 *     <li>The master switch (Googly Eyes / Elmo Transformation). OFF always wins: the effect disappears.</li>
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
		EyeBallConfig config = ConfigManager.get();
		if (!config.googlyEyes && !config.elmo) {
			return Appearance.NONE;
		}
		EyeBallConfig.PlayerOverride override = config.override(player);
		int synced = SyncedLooks.get(player);
		boolean googlyBase;
		boolean elmoBase;
		if (isSelf) {
			googlyBase = Appearance.forcedGoogly(synced) ? Appearance.googly(synced) : config.selfGoogly;
			elmoBase = Appearance.forcedElmo(synced) ? Appearance.elmo(synced) : config.selfElmo;
		} else {
			boolean showSynced = config.showSyncedLooks;
			googlyBase = config.everyoneGoogly || showSynced && Appearance.googly(synced);
			elmoBase = config.everyoneElmo || showSynced && Appearance.elmo(synced);
		}
		boolean googly = config.googlyEyes && (override != null && override.googly != null ? override.googly : googlyBase);
		boolean elmo = config.elmo && (override != null && override.elmo != null ? override.elmo : elmoBase);
		return Appearance.of(googly, elmo);
	}

	/** The look this client shares with the server for itself (what other modded players will see). */
	public static int lookToShare() {
		EyeBallConfig config = ConfigManager.get();
		if (!config.shareMyLook) {
			return Appearance.NONE;
		}
		Minecraft minecraft = Minecraft.getInstance();
		UUID self = minecraft.player != null ? minecraft.player.getUUID() : null;
		EyeBallConfig.PlayerOverride override = self != null ? config.override(self) : null;
		boolean googly = config.googlyEyes && (override != null && override.googly != null ? override.googly : config.selfGoogly);
		boolean elmo = config.elmo && (override != null && override.elmo != null ? override.elmo : config.selfElmo);
		return Appearance.of(googly, elmo);
	}

	public static boolean isLocal(UUID player) {
		Minecraft minecraft = Minecraft.getInstance();
		return minecraft.player != null && minecraft.player.getUUID().equals(player);
	}
}
