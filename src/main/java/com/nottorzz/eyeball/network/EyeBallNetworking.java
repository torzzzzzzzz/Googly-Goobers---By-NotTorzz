package com.nottorzz.eyeball.network;

import net.fabricmc.fabric.api.networking.v1.PayloadTypeRegistry;

/**
 * Registers every EyeBall payload type. Must run on both sides before any connection is made.
 * <p>
 * Fabric only advertises a channel to the other side when a receiver is registered, so a client can
 * reliably tell whether the server has the mod with {@code ClientPlayNetworking.canSend(...)}.
 */
public final class EyeBallNetworking {
	/** Bumped when the wire format changes in an incompatible way. */
	public static final int PROTOCOL_VERSION = 1;

	private static boolean registered;

	private EyeBallNetworking() {
	}

	public static void registerPayloadTypes() {
		if (registered) {
			return;
		}
		registered = true;
		PayloadTypeRegistry.serverboundPlay().register(SelfAppearancePayload.TYPE, SelfAppearancePayload.CODEC);
		PayloadTypeRegistry.serverboundPlay().register(FaceEventPayload.TYPE, FaceEventPayload.CODEC);
		PayloadTypeRegistry.clientboundPlay().register(AppearanceSyncPayload.TYPE, AppearanceSyncPayload.CODEC);
		PayloadTypeRegistry.clientboundPlay().register(PlayerFaceEventPayload.TYPE, PlayerFaceEventPayload.CODEC);
	}
}
