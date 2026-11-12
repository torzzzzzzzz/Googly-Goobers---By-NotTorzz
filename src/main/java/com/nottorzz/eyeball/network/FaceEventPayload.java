package com.nottorzz.eyeball.network;

import com.nottorzz.eyeball.EyeBallMod;
import io.netty.buffer.ByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;

/**
 * Client to server: the sender started talking or made a face. The server validates it and relays
 * it as a {@link PlayerFaceEventPayload} to nearby players that have the mod.
 *
 * @param kind       {@link com.nottorzz.eyeball.FaceEventKind} id
 * @param expression {@link com.nottorzz.eyeball.Expression} id
 * @param ticks      how long the animation should last
 */
public record FaceEventPayload(byte kind, byte expression, short ticks) implements CustomPacketPayload {
	public static final Type<FaceEventPayload> TYPE = new Type<>(EyeBallMod.id("face_event"));
	public static final StreamCodec<ByteBuf, FaceEventPayload> CODEC = StreamCodec.composite(
		ByteBufCodecs.BYTE, FaceEventPayload::kind,
		ByteBufCodecs.BYTE, FaceEventPayload::expression,
		ByteBufCodecs.SHORT, FaceEventPayload::ticks,
		FaceEventPayload::new
	);

	@Override
	public Type<? extends CustomPacketPayload> type() {
		return TYPE;
	}
}
