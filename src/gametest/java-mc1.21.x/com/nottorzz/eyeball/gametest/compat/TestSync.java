package com.nottorzz.eyeball.gametest.compat;

import io.netty.buffer.ByteBuf;
import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestServerContext;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.fabricmc.fabric.api.networking.v1.PayloadTypeRegistry;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerPlayer;

/**
 * Network sync for the tests (Minecraft 1.21.11 version). The 1.21.11 game test API cannot wait for
 * packets, so this does what newer versions of the API do: send a marker packet and wait until it
 * arrives. Packets on a connection are handled in order, so everything sent before it has arrived too.
 */
public final class TestSync implements ModInitializer {
	private static volatile boolean clientReceived;
	private static volatile boolean serverReceived;
	private static final int TIMEOUT_TICKS = 200;

	@Override
	public void onInitialize() {
		PayloadTypeRegistry.playS2C().register(SyncPayload.TYPE, SyncPayload.CODEC);
		PayloadTypeRegistry.playC2S().register(SyncPayload.TYPE, SyncPayload.CODEC);
		ServerPlayNetworking.registerGlobalReceiver(SyncPayload.TYPE, (payload, context) -> serverReceived = true);
		ClientPlayNetworking.registerGlobalReceiver(SyncPayload.TYPE, (payload, context) -> clientReceived = true);
	}

	public static void waitForClientbound(ClientGameTestContext context, TestServerContext server) {
		clientReceived = false;
		server.runOnServer(s -> {
			for (ServerPlayer player : s.getPlayerList().getPlayers()) {
				if (ServerPlayNetworking.canSend(player, SyncPayload.TYPE)) {
					ServerPlayNetworking.send(player, SyncPayload.INSTANCE);
				}
			}
		});
		context.waitFor(mc -> clientReceived, TIMEOUT_TICKS);
	}

	public static void waitForServerbound(ClientGameTestContext context) {
		serverReceived = false;
		context.runOnClient(mc -> ClientPlayNetworking.send(SyncPayload.INSTANCE));
		for (int i = 0; i < TIMEOUT_TICKS && !serverReceived; i++) {
			context.waitTick();
		}
		if (!serverReceived) {
			throw new AssertionError("The server did not receive the sync packet");
		}
	}

	private record SyncPayload() implements CustomPacketPayload {
		static final SyncPayload INSTANCE = new SyncPayload();
		static final Type<SyncPayload> TYPE = new Type<>(Identifier.fromNamespaceAndPath("eyeball-gametest", "sync"));
		static final StreamCodec<ByteBuf, SyncPayload> CODEC = StreamCodec.unit(INSTANCE);

		@Override
		public Type<? extends CustomPacketPayload> type() {
			return TYPE;
		}
	}
}
