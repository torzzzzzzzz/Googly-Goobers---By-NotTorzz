package com.nottorzz.eyeball.gametest;

import com.nottorzz.eyeball.EyeBallMod;
import com.nottorzz.eyeball.client.anim.FaceAnimationManager;
import com.nottorzz.eyeball.client.config.ConfigManager;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
import net.minecraft.client.CameraType;

/** Smoke test: render the googly face in a real client and take screenshots. */
public final class EyeBallClientGameTest implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			world.getConnection().waitForChunksRender();
			context.runOnClient(mc -> {
				mc.options.setCameraType(CameraType.THIRD_PERSON_FRONT);
				ConfigManager.get().googlyEyes = true;
				ConfigManager.get().elmo = false;
			});
			world.getServer().runCommand("time set noon");
			world.getServer().runCommand("gamemode survival @a");
			context.getInput().lookAt(180.0F, 0.0F);
			context.waitTicks(40);
			context.takeScreenshot("smoke_idle");
			context.runOnClient(mc -> mc.player.connection.sendChat("Hello everyone, look at my googly eyes!"));
			context.waitTicks(6);
			context.takeScreenshot("smoke_talking");
			world.getServer().runCommand("damage @a 1 minecraft:generic");
			context.waitTicks(4);
			context.takeScreenshot("smoke_hit");
			context.waitTicks(10);
			context.takeScreenshot("smoke_hit_later");
			context.runOnClient(mc -> {
				ConfigManager.get().elmo = true;
				ConfigManager.notifyChanged();
			});
			context.waitTicks(20);
			context.takeScreenshot("smoke_elmo");
			Integer tracked = context.computeOnClient(mc -> FaceAnimationManager.INSTANCE.trackedFaces());
			EyeBallMod.LOGGER.info("[gametest] faces tracked: {}", tracked);
		}
	}
}
