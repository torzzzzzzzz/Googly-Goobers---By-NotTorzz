package com.nottorzz.eyeball.network;

import com.nottorzz.eyeball.EyeBallMod;
import io.netty.buffer.ByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;

/**
 * Client to server: "this is the look I chose for myself" ({@link com.nottorzz.eyeball.Appearance} flags).
 * The server shares it with every other player that has the mod installed.
 */
public record SelfAppearancePayload(byte flags) implements CustomPacketPayload {
	public static final Type<SelfAppearancePayload> TYPE = new Type<>(EyeBallMod.id("self_appearance"));
	public static final StreamCodec<ByteBuf, SelfAppearancePayload> CODEC = StreamCodec.composite(
		ByteBufCodecs.BYTE, SelfAppearancePayload::flags,
		SelfAppearancePayload::new
	);

	@Override
	public Type<? extends CustomPacketPayload> type() {
		return TYPE;
	}
}
