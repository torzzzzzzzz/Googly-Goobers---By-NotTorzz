package com.nottorzz.eyeball.compat;

import io.netty.buffer.ByteBuf;
import net.fabricmc.fabric.api.networking.v1.PayloadTypeRegistry;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;

/** Payload registration, whose Fabric API names differ between Minecraft versions (Minecraft 26.x version). */
public final class PayloadCompat {
	private PayloadCompat() {
	}

	/** Client to server, during play. */
	public static <T extends CustomPacketPayload> void serverbound(CustomPacketPayload.Type<T> type, StreamCodec<ByteBuf, T> codec) {
		PayloadTypeRegistry.serverboundPlay().register(type, codec);
	}

	/** Server to client, during play. */
	public static <T extends CustomPacketPayload> void clientbound(CustomPacketPayload.Type<T> type, StreamCodec<ByteBuf, T> codec) {
		PayloadTypeRegistry.clientboundPlay().register(type, codec);
	}
}
