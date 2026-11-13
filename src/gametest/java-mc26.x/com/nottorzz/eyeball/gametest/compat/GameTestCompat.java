package com.nottorzz.eyeball.gametest.compat;

import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestDedicatedServerConnection;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestDedicatedServerContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/** The parts of Fabric's client game test API that differ between Minecraft versions (Minecraft 26.x version). */
public final class GameTestCompat {
	private GameTestCompat() {
	}

	public static void waitForChunksRender(TestSingleplayerContext world) {
		world.getConnection().waitForChunksRender();
	}

	public static Connection connect(ClientGameTestContext context, TestDedicatedServerContext server) {
		return new Connection(server.connect());
	}

	/** A client connected to the test's dedicated server. */
	public static final class Connection implements AutoCloseable {
		private final TestDedicatedServerConnection connection;

		private Connection(TestDedicatedServerConnection connection) {
			this.connection = connection;
		}

		public void waitForChunksRender() {
			this.connection.waitForChunksRender();
		}

		/** Waits until the client has handled every packet the server sent so far. */
		public void waitForClientboundPackets() {
			this.connection.waitForClientboundPackets();
		}

		/** Waits until the server has handled every packet the client sent so far. */
		public void waitForServerboundPackets() {
			this.connection.waitForServerboundPackets();
		}

		@Override
		public void close() {
			this.connection.close();
		}
	}
}
