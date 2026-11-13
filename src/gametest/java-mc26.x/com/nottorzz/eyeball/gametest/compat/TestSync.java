package com.nottorzz.eyeball.gametest.compat;

import net.fabricmc.api.ModInitializer;

/**
 * Network sync helper for the tests. Minecraft 26.x's game test API has its own packet sync,
 * so nothing needs registering here (Minecraft 26.x version).
 */
public final class TestSync implements ModInitializer {
	@Override
	public void onInitialize() {
	}
}
