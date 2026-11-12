package com.nottorzz.eyeball;

import com.nottorzz.eyeball.network.EyeBallNetworking;
import com.nottorzz.eyeball.server.EyeBallServer;
import net.fabricmc.api.ModInitializer;
import net.minecraft.resources.Identifier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Common entrypoint (runs on both the client and dedicated servers).
 * <p>
 * Registers the network payloads and the server-side look synchronisation. All rendering and
 * animation lives in the client source set ({@code com.nottorzz.eyeball.client}).
 */
public final class EyeBallMod implements ModInitializer {
	public static final String MOD_ID = "eyeball";
	public static final Logger LOGGER = LoggerFactory.getLogger("EyeBall");

	public static Identifier id(String path) {
		return Identifier.fromNamespaceAndPath(MOD_ID, path);
	}

	@Override
	public void onInitialize() {
		EyeBallNetworking.registerPayloadTypes();
		EyeBallServer.init();
		LOGGER.info("EyeBall Mod initialised - prepare for googly eyes");
	}
}
