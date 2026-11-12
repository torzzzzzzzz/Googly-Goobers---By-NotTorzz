package com.nottorzz.eyeball.client.network;

import com.nottorzz.eyeball.Expression;
import com.nottorzz.eyeball.FaceEventKind;
import com.nottorzz.eyeball.client.anim.FaceAnimationManager;
import com.nottorzz.eyeball.client.config.ConfigManager;
import com.nottorzz.eyeball.client.target.SyncedLooks;
import com.nottorzz.eyeball.client.target.TargetResolver;
import com.nottorzz.eyeball.network.AppearanceSyncPayload;
import com.nottorzz.eyeball.network.FaceEventPayload;
import com.nottorzz.eyeball.network.PlayerFaceEventPayload;
import com.nottorzz.eyeball.network.SelfAppearancePayload;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.minecraft.client.Minecraft;

/**
 * Client half of the multiplayer synchronisation (only does anything on servers with EyeBall):
 * shares your chosen look, receives everyone's looks, and sends/receives talk and expression events.
 */
public final class ClientSync {
	private static int lastSentLook = -1;

	private ClientSync() {
	}

	public static void init() {
		ClientPlayNetworking.registerGlobalReceiver(AppearanceSyncPayload.TYPE, (payload, context) -> SyncedLooks.apply(payload));
		ClientPlayNetworking.registerGlobalReceiver(PlayerFaceEventPayload.TYPE, (payload, context) -> onFaceEvent(payload));
		ClientPlayConnectionEvents.JOIN.register((handler, sender, client) -> {
			lastSentLook = -1;
			pushLook();
		});
		ClientPlayConnectionEvents.DISCONNECT.register((handler, client) -> {
			lastSentLook = -1;
			SyncedLooks.clear();
			FaceAnimationManager.INSTANCE.clear();
		});
		ConfigManager.addListener(ClientSync::pushLook);
	}

	/** Sends your look to the server if it changed (and if the server has the mod). */
	public static void pushLook() {
		Minecraft minecraft = Minecraft.getInstance();
		if (minecraft.player == null || !SyncedLooks.serverHasMod()) {
			return;
		}
		int look = TargetResolver.lookToShare();
		if (look != lastSentLook) {
			lastSentLook = look;
			ClientPlayNetworking.send(new SelfAppearancePayload((byte) look));
		}
	}

	public static void sendFaceEvent(FaceEventKind kind, Expression expression, int ticks) {
		if (!SyncedLooks.serverHasMod()) {
			return;
		}
		ClientPlayNetworking.send(new FaceEventPayload((byte) kind.ordinal(), (byte) expression.id, (short) Math.clamp(ticks, 1, 200)));
	}

	private static void onFaceEvent(PlayerFaceEventPayload payload) {
		Expression expression = Expression.byId(payload.expression());
		int ticks = payload.ticks();
		switch (FaceEventKind.byId(payload.kind())) {
			case TALK -> FaceAnimationManager.INSTANCE.onTalk(payload.player(), expression, ticks);
			case EXPRESSION -> FaceAnimationManager.INSTANCE.onExpression(payload.player(), expression, ticks);
			case REACTION -> FaceAnimationManager.INSTANCE.onReaction(payload.player(), 1.0F);
		}
	}
}
