package com.nottorzz.eyeball.network;

import com.nottorzz.eyeball.EyeBallMod;
import io.netty.buffer.ByteBuf;
import java.util.UUID;
import net.minecraft.core.UUIDUtil;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;

/** Server to client: a face event of another player (see {@link FaceEventPayload}). */
public record PlayerFaceEventPayload(UUID player, byte kind, byte expression, short ticks) implements CustomPacketPayload {
	public static final Type<PlayerFaceEventPayload> TYPE = new Type<>(EyeBallMod.id("player_face_event"));
	public static final StreamCodec<ByteBuf, PlayerFaceEventPayload> CODEC = StreamCodec.composite(
		UUIDUtil.STREAM_CODEC, PlayerFaceEventPayload::player,
		ByteBufCodecs.BYTE, PlayerFaceEventPayload::kind,
		ByteBufCodecs.BYTE, PlayerFaceEventPayload::expression,
		ByteBufCodecs.SHORT, PlayerFaceEventPayload::ticks,
		PlayerFaceEventPayload::new
	);

	@Override
	public Type<? extends CustomPacketPayload> type() {
		return TYPE;
	}
}
