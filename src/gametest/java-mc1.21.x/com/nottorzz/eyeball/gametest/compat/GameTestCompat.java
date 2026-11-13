package com.nottorzz.eyeball.gametest.compat;

import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestDedicatedServerContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestServerConnection;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/** The parts of Fabric's client game test API that differ between Minecraft versions (Minecraft 1.21.11 version). */
public final class GameTestCompat {
	private GameTestCompat() {
	}

	public static void waitForChunksRender(TestSingleplayerContext world) {
		world.getClientWorld().waitForChunksRender();
	}

	public static Connection connect(ClientGameTestContext context, TestDedicatedServerContext server) {
		return new Connection(context, server, server.connect());
	}

	/** A client connected to the test's dedicated server. */
	public static final class Connection implements AutoCloseable {
		private final ClientGameTestContext context;
		private final TestDedicatedServerContext server;
		private final TestServerConnection connection;

		private Connection(ClientGameTestContext context, TestDedicatedServerContext server, TestServerConnection connection) {
			this.context = context;
			this.server = server;
			this.connection = connection;
		}

		public void waitForChunksRender() {
			this.connection.getClientWorld().waitForChunksRender();
		}

		/** Waits until the client has handled every packet the server sent so far. */
		public void waitForClientboundPackets() {
			TestSync.waitForClientbound(this.context, this.server);
		}

		/** Waits until the server has handled every packet the client sent so far. */
		public void waitForServerboundPackets() {
			TestSync.waitForServerbound(this.context);
		}

		@Override
		public void close() {
			this.connection.close();
		}
	}
}
