package com.nottorzz.eyeball.network;

import com.nottorzz.eyeball.compat.PayloadCompat;

/**
 * Registers every Googly Goobers payload type. Must run on both sides before any connection is made.
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
		PayloadCompat.serverbound(SelfAppearancePayload.TYPE, SelfAppearancePayload.CODEC);
		PayloadCompat.serverbound(FaceEventPayload.TYPE, FaceEventPayload.CODEC);
		PayloadCompat.clientbound(AppearanceSyncPayload.TYPE, AppearanceSyncPayload.CODEC);
		PayloadCompat.clientbound(PlayerFaceEventPayload.TYPE, PlayerFaceEventPayload.CODEC);
	}
}
