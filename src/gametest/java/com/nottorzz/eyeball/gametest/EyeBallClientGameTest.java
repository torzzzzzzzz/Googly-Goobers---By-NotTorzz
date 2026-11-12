package com.nottorzz.eyeball.gametest;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.mojang.authlib.GameProfile;
import com.nottorzz.eyeball.Appearance;
import com.nottorzz.eyeball.Expression;
import com.nottorzz.eyeball.FaceEventKind;
import com.nottorzz.eyeball.client.anim.FaceAnimationManager;
import com.nottorzz.eyeball.client.anim.FacePose;
import com.nottorzz.eyeball.client.anim.FaceState;
import com.nottorzz.eyeball.client.config.ConfigManager;
import com.nottorzz.eyeball.client.config.EyeBallConfig;
import com.nottorzz.eyeball.client.gui.EyeBallConfigScreen;
import com.nottorzz.eyeball.client.gui.PlayerSelectionScreen;
import com.nottorzz.eyeball.client.gui.PreviewController;
import com.nottorzz.eyeball.client.gui.widget.ToggleSwitch;
import com.nottorzz.eyeball.client.input.EyeBallKeys;
import com.nottorzz.eyeball.client.render.FaceMeshBuilder;
import com.nottorzz.eyeball.client.render.FaceRenderData;
import com.nottorzz.eyeball.client.render.FaceRenderLayer;
import com.nottorzz.eyeball.client.render.elmo.ElmoRenderer;
import com.nottorzz.eyeball.client.target.SyncedLooks;
import com.nottorzz.eyeball.server.EyeBallServer;
import com.nottorzz.eyeball.server.ForcedLookStore;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.function.Consumer;
import java.util.function.Function;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestDedicatedServerConnection;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestDedicatedServerContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestServerContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
import net.fabricmc.fabric.api.entity.FakePlayer;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.CameraType;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.components.AbstractWidget;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.client.renderer.entity.state.EntityRenderState;
import net.minecraft.network.chat.Component;
import net.minecraft.network.protocol.game.ClientboundPlayerInfoUpdatePacket;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.phys.Vec3;

/**
 * Full in-game test of EyeBall Mod in a real Minecraft client (run with {@code ./gradlew runClientGameTest}).
 * Covers rendering, every animation, hit reactions and their priority, Elmo, every switch, the menu
 * with its preview and player selection, settings persistence across restarts (run twice), real
 * multiplayer sync against a dedicated server with a second player, and performance.
 * Writes {@code eyeball-test-report.md} and screenshots into the run directory.
 */
public final class EyeBallClientGameTest implements FabricClientGameTest {
	private static final UUID BOB = UUID.fromString("b0b0b0b0-1234-4321-8888-0000000000b0");
	private static final String MARKER = "eyeball-persistence-marker.json";
	private static final Gson GSON = new Gson();

	private final TestReport report = new TestReport();
	private ClientGameTestContext ctx;

	@Override
	public void runTest(ClientGameTestContext context) {
		this.ctx = context;
		Path runDir = FabricLoader.getInstance().getGameDir();
		context.getInput().resizeWindow(1280, 720);
		try {
			boolean verifiedPersistence = this.verifyPersistedSettings(runDir);
			this.config(c -> c.copyFrom(EyeBallConfig.defaults()));
			this.titleScreenMenu();
			this.singleplayer();
			this.multiplayer();
			if (!verifiedPersistence) {
				this.writePersistedSettings(runDir);
			}
		} finally {
			this.report.write(runDir.resolve("eyeball-test-report.md"));
		}
		this.report.finish();
	}

	// ------------------------------------------------------------------ persistence (two launches)

	private boolean verifyPersistedSettings(Path runDir) {
		Path marker = runDir.resolve("config").resolve(MARKER);
		if (!Files.isRegularFile(marker)) {
			return false;
		}
		this.report.section("Settings persist after restarting Minecraft");
		try {
			JsonObject expected = GSON.fromJson(Files.readString(marker, StandardCharsets.UTF_8), JsonObject.class);
			EyeBallConfig loaded = this.ctx.computeOnClient(mc -> {
				EyeBallConfig copy = new EyeBallConfig();
				copy.copyFrom(ConfigManager.get());
				return copy;
			});
			this.report.check("eye size restored", Math.abs(loaded.eyeSize - expected.get("eyeSize").getAsFloat()) < 1e-4, "loaded " + loaded.eyeSize);
			this.report.check("spiral speed restored", Math.abs(loaded.spiralSpeed - expected.get("spiralSpeed").getAsFloat()) < 1e-4, "loaded " + loaded.spiralSpeed);
			this.report.check("Elmo switch restored", loaded.elmo == expected.get("elmo").getAsBoolean(), "loaded " + loaded.elmo);
			this.report.check("blinking switch restored", loaded.blinking == expected.get("blinking").getAsBoolean(), "loaded " + loaded.blinking);
			this.report.check("apply-to-everyone (Elmo) restored", loaded.everyoneElmo == expected.get("everyoneElmo").getAsBoolean(), "");
			EyeBallConfig.PlayerOverride bob = loaded.override(BOB);
			this.report.check("per-player choice restored", bob != null && Boolean.FALSE.equals(bob.googly), bob == null ? "missing" : "googly=" + bob.googly);
			Files.delete(marker);
		} catch (IOException | RuntimeException e) {
			this.report.check("persistence marker readable", false, e.toString());
		}
		return true;
	}

	private void writePersistedSettings(Path runDir) {
		this.report.section("Settings saved for the restart check");
		this.config(c -> {
			c.copyFrom(EyeBallConfig.defaults());
			c.eyeSize = 1.35F;
			c.spiralSpeed = 2.25F;
			c.elmo = true;
			c.blinking = false;
			c.everyoneElmo = true;
			c.getOrCreateOverride(BOB, "GooglyBob").googly = Boolean.FALSE;
		});
		this.ctx.runOnClient(mc -> ConfigManager.save());
		JsonObject expected = new JsonObject();
		expected.addProperty("eyeSize", 1.35F);
		expected.addProperty("spiralSpeed", 2.25F);
		expected.addProperty("elmo", true);
		expected.addProperty("blinking", false);
		expected.addProperty("everyoneElmo", true);
		try {
			Files.writeString(runDir.resolve("config").resolve(MARKER), GSON.toJson(expected), StandardCharsets.UTF_8);
			this.report.note("Distinct settings saved to config/eyeball.json; the next launch verifies they were restored.");
		} catch (IOException e) {
			this.report.check("write persistence marker", false, e.toString());
		}
	}

	// ------------------------------------------------------------------ title screen

	private void titleScreenMenu() {
		this.report.section("Menu on the title screen (no world loaded)");
		this.ctx.setScreen(() -> new EyeBallConfigScreen(null));
		this.ctx.waitForScreen(EyeBallConfigScreen.class);
		this.ctx.waitTicks(30);
		boolean previewShown = this.ctx.computeOnClient(mc -> mc.gui.screen() instanceof EyeBallConfigScreen s && s.previewPanel() != null);
		this.report.check("menu opens without a world, with preview", previewShown, "");
		this.report.screenshot(this.ctx, "menu_title_screen", "Settings menu opened from the title screen; preview uses the default skin");
		this.ctx.setScreen(() -> null);
	}

	// ------------------------------------------------------------------ singleplayer

	private void singleplayer() {
		try (TestSingleplayerContext world = this.ctx.worldBuilder().create()) {
			world.getConnection().waitForChunksRender();
			TestServerContext server = world.getServer();
			server.runCommand("time set noon");
			server.runCommand("gamemode survival @a");
			server.runCommand("difficulty normal");
			this.ctx.runOnClient(mc -> {
				mc.options.setCameraType(CameraType.THIRD_PERSON_FRONT);
				mc.options.fov().set(30);
				if (!mc.gui.hud.isHidden()) {
					mc.gui.hud.toggle();
				}
			});
			this.ctx.getInput().lookAt(0.0F, 0.0F);
			UUID self = this.ctx.computeOnClient(mc -> mc.player.getUUID());
			this.ctx.waitTicks(40);

			this.googlyRendering(self);
			this.eyeMovement(self);
			this.blinking(self);
			this.talking(self);
			this.expressions(self);
			// Players can't be hurt during the first 3 seconds after joining.
			this.ctx.waitTicks(40);
			this.hitReaction(server, self);
			this.priority(server, self);
			this.individualSettings(server, self);
			this.elmo(server, self);
			this.masterSwitches(self);
			this.menuInWorld(self);
		}
	}

	private void googlyRendering(UUID self) {
		this.report.section("Googly eyes render");
		FaceRenderData data = this.extract();
		this.report.check("face attached to the player's render state", data != null && data.googly && !data.elmo, data == null ? "no data" : "googly=" + data.googly);
		this.report.check("eyebrows enabled on the googly face", data != null && data.showBrows, "");
		Integer quads = this.ctx.computeOnClient(mc -> FaceMeshBuilder.lastQuadCount());
		this.report.check("3D face geometry built", quads != null && quads > 200, quads + " quads per face");
		this.report.screenshot(this.ctx, "googly_idle", "Idle googly face: rimmed 3D eyes, pupils with highlights, brows, mouth");
	}

	private void eyeMovement(UUID self) {
		this.report.section("Pupils move");
		FacePose before = this.pose(self);
		this.ctx.getInput().lookAt(70.0F, -25.0F);
		float maxShift = 0.0F;
		for (int i = 0; i < 12; i++) {
			this.ctx.waitTick();
			FacePose now = this.pose(self);
			maxShift = Math.max(maxShift, Math.abs(now.pupilX[0] - before.pupilX[0]) + Math.abs(now.pupilY[0] - before.pupilY[0]));
		}
		this.report.check("pupils react to head turning", maxShift > 0.15F, String.format(Locale.ROOT, "max shift %.2f eye radii", maxShift));
		FacePose turned = this.pose(self);
		this.report.check("the two pupils move independently", Math.abs(turned.pupilX[0] - turned.pupilX[1]) > 0.005F || Math.abs(turned.pupilY[0] - turned.pupilY[1]) > 0.005F,
			String.format(Locale.ROOT, "left (%.2f, %.2f) right (%.2f, %.2f)", turned.pupilX[0], turned.pupilY[0], turned.pupilX[1], turned.pupilY[1]));
		this.ctx.getInput().lookAt(0.0F, 0.0F);
		this.ctx.waitTicks(20);
	}

	private void blinking(UUID self) {
		this.report.section("Eyes blink");
		this.ctx.runOnClient(mc -> FaceAnimationManager.INSTANCE.stateFor(self).forceBlink());
		float minOpen = this.minOver(4, mc -> {
			FacePose p = this.poseOnClient(self);
			return Math.min(p.eyeOpen[0], p.eyeOpen[1]);
		});
		this.report.check("blink closes the eyes", minOpen < 0.4F, String.format(Locale.ROOT, "min openness %.2f", minOpen));
		this.ctx.waitTicks(4);
		float open = this.pose(self).eyeOpen[0];
		this.report.check("eyes open again after the blink", open > 0.85F, String.format(Locale.ROOT, "openness %.2f", open));
		int blinks = 0;
		boolean wasClosed = false;
		for (int i = 0; i < 160; i++) {
			this.ctx.waitTick();
			boolean closed = this.pose(self).eyeOpen[0] < 0.6F;
			if (closed && !wasClosed) {
				blinks++;
			}
			wasClosed = closed;
		}
		this.report.check("random blinking happens on its own", blinks >= 1, blinks + " blinks in 8 seconds");
	}

	private void talking(UUID self) {
		this.report.section("Talking animation");
		FacePose idle = this.pose(self);
		this.ctx.runOnClient(mc -> mc.player.connection.sendChat("Hello everyone, look at my amazing googly eyes today"));
		float maxOpen = 0.0F;
		float maxBrow = Float.NEGATIVE_INFINITY;
		float maxEye = 0.0F;
		float maxNod = 0.0F;
		for (int i = 0; i < 16; i++) {
			this.ctx.waitTick();
			FacePose p = this.pose(self);
			maxOpen = Math.max(maxOpen, p.mouthOpen);
			maxBrow = Math.max(maxBrow, p.browLift[0]);
			maxEye = Math.max(maxEye, p.eyeScale[0] / Math.max(0.01F, idle.eyeScale[0]));
			maxNod = Math.max(maxNod, Math.abs(p.headNod));
			if (i == 5) {
				this.report.screenshot(this.ctx, "talking", "Talking after sending a chat message: mouth open, brows up");
			}
		}
		this.report.check("mouth opens when chatting", maxOpen > 0.3F, String.format(Locale.ROOT, "max open %.2f", maxOpen));
		this.report.check("eyebrows move while talking", maxBrow > idle.browLift[0] + 0.15F, String.format(Locale.ROOT, "brow lift %.2f -> %.2f", idle.browLift[0], maxBrow));
		this.report.check("eyes get slightly bigger while talking", maxEye > 1.02F, String.format(Locale.ROOT, "x%.3f", maxEye));
		this.report.check("head moves while talking", maxNod > 0.01F, String.format(Locale.ROOT, "max nod %.3f rad", maxNod));
		this.ctx.waitTicks(110);
		float closed = this.pose(self).mouthOpen;
		this.report.check("mouth closes again after talking", closed < 0.12F, String.format(Locale.ROOT, "open %.2f", closed));

		this.chatExpression(self, "hahahaha that is so funny", Expression.LAUGHING);
		this.chatExpression(self, "WHAT ARE YOU DOING", Expression.WIDE_OPEN);
		this.chatExpression(self, "wow no way?!", Expression.SURPRISED);
		this.chatExpression(self, "ok", Expression.SMALL_TALK);
		this.chatExpression(self, "grr I am so mad", Expression.ANGRY);
		this.chatExpression(self, "yay lets go!!", Expression.EXCITED);
	}

	private void chatExpression(UUID self, String message, Expression expected) {
		this.ctx.runOnClient(mc -> mc.player.connection.sendChat(message));
		this.ctx.waitTicks(3);
		Expression mood = this.ctx.computeOnClient(mc -> FaceAnimationManager.INSTANCE.stateFor(self).activeMood());
		this.report.check("chat \"" + message + "\" gives a " + expected.key() + " face", mood == expected, "got " + mood);
		if (expected == Expression.LAUGHING || expected == Expression.WIDE_OPEN) {
			this.ctx.waitTicks(4);
			this.report.screenshot(this.ctx, "talk_" + expected.key(), "Talking expression from chat: " + expected.key());
		}
		this.ctx.waitTicks(150);
	}

	private void expressions(UUID self) {
		this.report.section("Expressions and eyebrows");
		FacePose neutral = this.pose(self);
		this.makeFace(Expression.SURPRISED);
		FacePose surprised = this.pose(self);
		this.report.check("surprised: eyes pop bigger", surprised.eyeScale[0] > neutral.eyeScale[0] * 1.12F,
			String.format(Locale.ROOT, "%.2f -> %.2f", neutral.eyeScale[0], surprised.eyeScale[0]));
		this.report.check("surprised: eyebrows shoot up", surprised.browLift[0] > 0.8F, String.format(Locale.ROOT, "lift %.2f", surprised.browLift[0]));
		this.report.check("surprised: round open mouth", surprised.mouthOpen > 0.35F && surprised.mouthWidth < 0.85F,
			String.format(Locale.ROOT, "open %.2f width %.2f", surprised.mouthOpen, surprised.mouthWidth));
		this.report.screenshot(this.ctx, "expr_surprised", "Surprised expression (keybind): huge eyes, raised brows, O mouth");
		this.ctx.waitTicks(70);

		this.makeFace(Expression.ANGRY);
		FacePose angry = this.pose(self);
		this.report.check("angry: brows tilt down to the middle", angry.browAngle[0] > 0.25F, String.format(Locale.ROOT, "angle %.2f rad", angry.browAngle[0]));
		this.report.check("angry: bared teeth and frown", angry.mouthTeeth > 0.6F && angry.mouthSmile < -0.3F,
			String.format(Locale.ROOT, "teeth %.2f smile %.2f", angry.mouthTeeth, angry.mouthSmile));
		this.report.screenshot(this.ctx, "expr_angry", "Angry expression: slanted brows, gritted teeth");
		this.ctx.waitTicks(70);

		this.makeFace(Expression.CONFUSED);
		FacePose confused = this.pose(self);
		this.report.check("confused: one brow up, one down", Math.abs(confused.browLift[0] - confused.browLift[1]) > 0.6F,
			String.format(Locale.ROOT, "%.2f vs %.2f", confused.browLift[0], confused.browLift[1]));
		this.ctx.waitTicks(70);

		this.makeFace(Expression.HAPPY);
		FacePose happy = this.pose(self);
		this.report.check("happy: smiling", happy.mouthSmile > 0.6F, String.format(Locale.ROOT, "smile %.2f", happy.mouthSmile));
		this.ctx.waitTicks(70);

		this.makeFace(Expression.LAUGHING);
		float squint = this.minOver(10, mc -> this.poseOnClient(self).eyeOpen[0]);
		this.report.check("laughing: happy squint", squint < 0.8F, String.format(Locale.ROOT, "openness %.2f", squint));
		this.report.screenshot(this.ctx, "expr_laughing", "Laughing expression: squinting eyes, big D-shaped mouth");
		this.ctx.waitTicks(70);
	}

	private void makeFace(Expression expression) {
		this.ctx.runOnClient(mc -> EyeBallKeys.makeFace(mc, expression));
		this.ctx.waitTicks(12);
	}

	private void hitReaction(TestServerContext server, UUID self) {
		this.report.section("Hit reaction: spiral eyes");
		float health = this.ctx.computeOnClient(mc -> mc.player.getHealth());
		server.runCommand("damage @p 1 minecraft:generic");
		this.ctx.waitTicks(2);
		float after = this.ctx.computeOnClient(mc -> mc.player.getHealth());
		this.report.check("damage applied", after < health, health + " -> " + after);
		FacePose first = this.pose(self);
		this.report.check("spiral eyes appear immediately", first.spiral, "");
		// The pop and the shocked mouth spring open over the next few ticks.
		float peakEye = this.maxOver(6, mc -> this.poseOnClient(self).eyeScale[0]);
		float peakMouth = this.ctx.computeOnClient(mc -> this.poseOnClient(self).mouthOpen);
		this.report.check("eyes become bigger", peakEye > 1.1F, String.format(Locale.ROOT, "peak x%.2f", peakEye));
		this.report.check("shocked open mouth", peakMouth > 0.45F, String.format(Locale.ROOT, "open %.2f", peakMouth));
		FacePose second = this.pose(self);
		this.report.check("spirals rotate", Math.abs(second.spiralAngle - first.spiralAngle) > 0.5F,
			String.format(Locale.ROOT, "%.2f -> %.2f rad", first.spiralAngle, second.spiralAngle));
		this.report.check("head wobbles", Math.abs(second.wobbleZ) + Math.abs(second.wobbleY) + Math.abs(second.wobbleX) > 0.02F,
			String.format(Locale.ROOT, "wobble z %.3f y %.3f", second.wobbleZ, second.wobbleY));
		this.report.check("body staggers", Math.abs(second.leanX) + Math.abs(second.leanZ) > 0.01F, String.format(Locale.ROOT, "lean %.3f", second.leanX));
		this.ctx.waitTicks(2);
		this.report.check("cartoon stars appear", this.pose(self).stars > 0.3F, String.format(Locale.ROOT, "stars %.2f", this.pose(self).stars));
		this.report.screenshot(this.ctx, "hit_spiral", "Hit reaction: huge spinning spiral eyes, shocked mouth, wobble, stars");
		this.ctx.waitTicks(4);
		this.report.screenshot(this.ctx, "hit_spiral_2", "Hit reaction a moment later (spirals have rotated, stars orbit)");
		this.ctx.waitTicks(40);
		boolean done = this.ctx.computeOnClient(mc -> !FaceAnimationManager.INSTANCE.stateFor(self).isReacting());
		FacePose end = this.pose(self);
		this.report.check("reaction finishes", done && !end.spiral, "reacting=" + !done + " spiral=" + end.spiral);
		this.ctx.waitTicks(30);
		FacePose settled = this.pose(self);
		this.report.check("face returns to normal", Math.abs(settled.eyeScale[0] - 1.0F) < 0.2F && settled.mouthOpen < 0.15F && settled.stars < 0.05F,
			String.format(Locale.ROOT, "eye x%.2f mouth %.2f stars %.2f", settled.eyeScale[0], settled.mouthOpen, settled.stars));
		this.report.screenshot(this.ctx, "hit_recovered", "After the reaction: normal googly eyes again");
		server.runCommand("effect give @p minecraft:instant_health 1 1 true");
	}

	private void priority(TestServerContext server, UUID self) {
		this.report.section("Animation priority (hit while talking)");
		this.ctx.runOnClient(mc -> mc.player.connection.sendChat("This is a really long message so I keep on talking for quite a while longer"));
		this.ctx.waitTicks(10);
		Expression talking = this.mood(self);
		server.runCommand("damage @p 1 minecraft:generic");
		this.ctx.waitTicks(3);
		Expression duringHit = this.mood(self);
		int talkLeft = this.ctx.computeOnClient(mc -> FaceAnimationManager.INSTANCE.stateFor(self).talkTicksLeft());
		this.report.check("talking is paused by the hit (hit has priority)", talking != Expression.NEUTRAL && duringHit == Expression.DIZZY, talking + " -> " + duringHit);
		this.ctx.waitTicks(36);
		Expression afterHit = this.mood(self);
		this.report.check("talking resumes after the hit when still talking", afterHit != Expression.DIZZY && afterHit != Expression.NEUTRAL,
			"after hit: " + afterHit + ", talk ticks left during hit: " + talkLeft);
		this.ctx.waitTicks(100);
		this.report.check("then the normal face returns", this.mood(self) == Expression.NEUTRAL, "mood " + this.mood(self));
		server.runCommand("effect give @p minecraft:instant_health 1 1 true");

		this.ctx.runOnClient(mc -> mc.player.connection.sendChat("hi"));
		this.ctx.waitTicks(2);
		server.runCommand("damage @p 1 minecraft:generic");
		this.ctx.waitTicks(40);
		this.report.check("short talk that ended during the hit goes straight back to normal", this.mood(self) == Expression.NEUTRAL, "mood " + this.mood(self));
		server.runCommand("effect give @p minecraft:instant_health 1 1 true");
		this.ctx.waitTicks(10);
	}

	private void individualSettings(TestServerContext server, UUID self) {
		this.report.section("Individual settings");
		this.config(c -> c.spiralEyes = false);
		server.runCommand("damage @p 1 minecraft:generic");
		this.ctx.waitTicks(3);
		FacePose noSpiral = this.pose(self);
		boolean reacting = this.ctx.computeOnClient(mc -> FaceAnimationManager.INSTANCE.stateFor(self).isReacting());
		this.report.check("Spiral Eyes OFF: reaction without spirals", reacting && !noSpiral.spiral, "reacting=" + reacting + " spiral=" + noSpiral.spiral);
		this.report.screenshot(this.ctx, "setting_spiral_off", "Spiral Eyes OFF: still shocked and dizzy, but normal eyes");
		this.ctx.waitTicks(45);
		this.config(c -> {
			c.spiralEyes = true;
			c.cartoonStars = false;
			c.headWobble = false;
		});
		server.runCommand("damage @p 1 minecraft:generic");
		this.ctx.waitTicks(6);
		FacePose quiet = this.pose(self);
		this.report.check("Cartoon Stars OFF: no stars", quiet.stars == 0.0F, String.format(Locale.ROOT, "stars %.2f", quiet.stars));
		this.report.check("Head Wobble OFF: no wobble or stagger", quiet.wobbleZ == 0.0F && quiet.leanX == 0.0F, "");
		this.report.check("spirals still shown", quiet.spiral, "");
		this.ctx.waitTicks(45);
		this.config(c -> {
			c.cartoonStars = true;
			c.headWobble = true;
			c.hitReactions = false;
		});
		server.runCommand("damage @p 1 minecraft:generic");
		this.ctx.waitTicks(3);
		boolean reactingWhenOff = this.ctx.computeOnClient(mc -> FaceAnimationManager.INSTANCE.stateFor(self).isReacting());
		this.report.check("Hit Reactions OFF: no reaction", !reactingWhenOff && !this.pose(self).spiral, "");
		this.config(c -> c.hitReactions = true);
		server.runCommand("effect give @p minecraft:instant_health 1 1 true");

		this.config(c -> c.talkingAnimations = false);
		this.ctx.runOnClient(mc -> mc.player.connection.sendChat("this should not move my mouth at all"));
		float maxOpen = this.maxOver(12, mc -> this.poseOnClient(self).mouthOpen);
		this.report.check("Talking Animations OFF: mouth stays shut", maxOpen < 0.12F, String.format(Locale.ROOT, "max open %.2f", maxOpen));
		this.config(c -> c.talkingAnimations = true);

		this.config(c -> c.eyebrows = false);
		FaceRenderData noBrows = this.extract();
		this.report.check("Eyebrows OFF: brows hidden", noBrows != null && !noBrows.showBrows, "");
		this.report.screenshot(this.ctx, "setting_brows_off", "Eyebrows OFF");
		this.config(c -> c.eyebrows = true);

		this.config(c -> c.eyebrowAnimations = false);
		this.makeFace(Expression.SURPRISED);
		float lift = this.pose(self).browLift[0];
		this.report.check("Eyebrow Animations OFF: brows stay still", Math.abs(lift) < 0.05F, String.format(Locale.ROOT, "lift %.2f", lift));
		this.config(c -> c.eyebrowAnimations = true);
		this.ctx.waitTicks(60);

		this.config(c -> c.eyeMovement = false);
		this.ctx.getInput().lookAt(60.0F, 30.0F);
		this.ctx.waitTicks(25);
		FacePose still = this.pose(self);
		this.report.check("Eye Movement OFF: pupils stay centred", Math.abs(still.pupilX[0]) < 0.15F && Math.abs(still.pupilY[0] + 0.1F) < 0.15F,
			String.format(Locale.ROOT, "pupil (%.2f, %.2f)", still.pupilX[0], still.pupilY[0]));
		this.config(c -> c.eyeMovement = true);
		this.ctx.getInput().lookAt(0.0F, 0.0F);

		this.config(c -> c.blinking = false);
		float minOpen = this.minOver(140, mc -> this.poseOnClient(self).eyeOpen[0]);
		this.report.check("Blinking OFF: no blinks for 7 seconds", minOpen > 0.85F, String.format(Locale.ROOT, "min openness %.2f", minOpen));
		this.config(c -> c.blinking = true);

		this.config(c -> {
			c.eyeSize = 1.8F;
			c.pupilSize = 1.4F;
			c.mouthSize = 1.5F;
			c.eyebrowSize = 1.6F;
		});
		this.ctx.waitTicks(5);
		FaceRenderData big = this.extract();
		this.report.check("size sliders reach the renderer", big != null && big.eyeSize == 1.8F && big.pupilSize == 1.4F && big.mouthSize == 1.5F && big.browSize == 1.6F, "");
		this.report.screenshot(this.ctx, "setting_big_eyes", "Eye Size 1.8x, Pupil 1.4x, Mouth 1.5x, Eyebrow 1.6x");
		this.config(c -> {
			c.eyeSize = 1.0F;
			c.pupilSize = 1.0F;
			c.mouthSize = 1.0F;
			c.eyebrowSize = 1.0F;
			c.eyeSpacing = 1.35F;
		});
		this.ctx.waitTicks(3);
		this.report.screenshot(this.ctx, "setting_eye_spacing", "Eye Spacing 1.35x");
		this.config(c -> c.eyeSpacing = 1.0F);
	}

	private void elmo(TestServerContext server, UUID self) {
		this.report.section("Elmo transformation");
		this.config(c -> c.elmo = true);
		this.ctx.waitTicks(5);
		boolean elmoRenderer = this.ctx.computeOnClient(mc -> mc.getEntityRenderDispatcher().getRenderer(mc.player) instanceof ElmoRenderer);
		FaceRenderData data = this.extract();
		this.report.check("player is drawn by the Elmo renderer", elmoRenderer, "");
		this.report.check("Elmo face data (googly eyes on Elmo)", data != null && data.elmo && data.googly, "");
		this.report.screenshot(this.ctx, "elmo", "Elmo transformation with googly eyes: fur shells, orange nose, big mouth");
		this.ctx.runOnClient(mc -> mc.player.connection.sendChat("Elmo loves to talk with everybody! hahaha"));
		float maxOpen = this.maxOver(8, mc -> this.poseOnClient(self).mouthOpen);
		this.report.check("Elmo mouth talks", maxOpen > 0.3F, String.format(Locale.ROOT, "max open %.2f", maxOpen));
		this.report.screenshot(this.ctx, "elmo_talking", "Elmo talking (laughing message)");
		this.ctx.waitTicks(100);
		server.runCommand("damage @p 1 minecraft:generic");
		this.ctx.waitTicks(6);
		this.report.check("Elmo gets spiral eyes when hit", this.pose(self).spiral, "");
		this.report.screenshot(this.ctx, "elmo_hit", "Elmo hit reaction: spiral eyes and stars");
		this.ctx.waitTicks(45);
		server.runCommand("effect give @p minecraft:instant_health 1 1 true");

		this.config(c -> c.googlyEyes = false);
		this.ctx.waitTicks(3);
		FaceRenderData pure = this.extract();
		this.report.check("Elmo without Googly Eyes keeps Elmo's own eyes, no brows", pure != null && pure.elmo && !pure.googly && !pure.showBrows, "");
		this.report.screenshot(this.ctx, "elmo_only", "Elmo with Googly Eyes OFF: Elmo's own soft eyes");
		this.config(c -> c.characterSize = 1.3F);
		this.ctx.waitTicks(3);
		this.report.screenshot(this.ctx, "elmo_character_size", "Elmo with Character Size 1.3x (bigger head)");
		this.config(c -> {
			c.characterSize = 1.0F;
			c.googlyEyes = true;
		});
		// Hiding the HUD (F1) also hides your hand, so show it for this shot.
		this.ctx.runOnClient(mc -> {
			mc.options.setCameraType(CameraType.FIRST_PERSON);
			mc.options.fov().set(70);
			if (mc.gui.hud.isHidden()) {
				mc.gui.hud.toggle();
			}
		});
		this.ctx.waitTicks(5);
		this.report.screenshot(this.ctx, "elmo_first_person", "First person as Elmo: red furry arm");
		this.ctx.runOnClient(mc -> {
			mc.options.setCameraType(CameraType.THIRD_PERSON_FRONT);
			mc.options.fov().set(30);
			if (!mc.gui.hud.isHidden()) {
				mc.gui.hud.toggle();
			}
		});
		this.config(c -> c.elmo = false);
		this.ctx.waitTicks(3);
		boolean vanilla = this.ctx.computeOnClient(mc -> !(mc.getEntityRenderDispatcher().getRenderer(mc.player) instanceof ElmoRenderer));
		this.report.check("Elmo OFF: back to the normal player renderer immediately", vanilla, "");
	}

	private void masterSwitches(UUID self) {
		this.report.section("Main ON/OFF switches");
		this.config(c -> c.googlyEyes = false);
		FaceRenderData none = this.extract();
		this.report.check("Googly Eyes OFF: effect disappears immediately", none == null, "");
		this.report.screenshot(this.ctx, "all_off", "Both modes OFF: plain vanilla player");
		this.config(c -> c.googlyEyes = true);
		FaceRenderData back = this.extract();
		this.report.check("Googly Eyes ON: effect returns immediately", back != null && back.googly, "");
		this.config(c -> c.selfGoogly = false);
		this.report.check("Apply to Myself OFF hides it on me", this.extract() == null, "");
		this.config(c -> c.selfGoogly = true);
	}

	private void menuInWorld(UUID self) {
		this.report.section("Menu, preview and player selection (in a world)");
		this.ctx.getInput().pressKey(EyeBallKeys.openMenuKey());
		this.ctx.waitForScreen(EyeBallConfigScreen.class);
		this.report.check("G key opens the EyeBall menu", true, "");
		this.ctx.waitTicks(10);
		this.report.screenshot(this.ctx, "menu", "The EyeBall menu with live preview");

		boolean toggled = this.ctx.computeOnClient(mc -> {
			EyeBallConfigScreen screen = (EyeBallConfigScreen) mc.gui.screen();
			for (AbstractWidget widget : screen.settingsList().allWidgets()) {
				if (widget instanceof ToggleSwitch toggle && widget.getMessage().getString().equals("Googly Eyes")) {
					toggle.onPress(null);
					return true;
				}
			}
			return false;
		});
		boolean offNow = this.ctx.computeOnClient(mc -> !ConfigManager.get().googlyEyes);
		this.report.check("menu switch turns Googly Eyes OFF", toggled && offNow, "");
		this.ctx.computeOnClient(mc -> {
			EyeBallConfigScreen screen = (EyeBallConfigScreen) mc.gui.screen();
			for (AbstractWidget widget : screen.settingsList().allWidgets()) {
				if (widget instanceof ToggleSwitch toggle && widget.getMessage().getString().equals("Googly Eyes")) {
					toggle.onPress(null);
				}
			}
			return null;
		});
		this.report.check("menu switch turns it back ON", this.ctx.computeOnClient(mc -> ConfigManager.get().googlyEyes), "");

		for (PreviewController.Mode mode : PreviewController.Mode.values()) {
			this.ctx.runOnClient(mc -> ((EyeBallConfigScreen) mc.gui.screen()).previewController().setMode(mode));
			this.ctx.waitTicks(mode.isHit() ? 12 : 20);
			this.report.screenshot(this.ctx, "preview_" + mode.name().toLowerCase(Locale.ROOT), "Preview: " + mode.label().getString());
		}
		this.ctx.runOnClient(mc -> {
			EyeBallConfigScreen screen = (EyeBallConfigScreen) mc.gui.screen();
			screen.previewController().setMode(PreviewController.Mode.SPIRAL);
			screen.previewPanel().setZoom(1.0F);
			screen.previewPanel().setYaw(30.0F);
		});
		this.ctx.waitTicks(12);
		this.report.screenshot(this.ctx, "preview_zoom_rotated", "Preview zoomed in and rotated (drag / scroll)");

		this.ctx.runOnClient(mc -> ConfigManager.get().eyeSize = 1.23F);
		this.ctx.clickScreenButton("Save Settings");
		this.ctx.waitTicks(2);
		boolean saved = this.ctx.computeOnClient(mc -> {
			EyeBallConfig onDisk = ConfigManager.readFrom(ConfigManager.path());
			return onDisk != null && Math.abs(onDisk.eyeSize - 1.23F) < 1e-4;
		});
		this.report.check("Save Settings writes the config file", saved, "");
		this.ctx.clickScreenButton("Reset to Defaults");
		boolean reset = this.ctx.computeOnClient(mc -> ConfigManager.get().eyeSize == 1.0F && ConfigManager.get().googlyEyes);
		this.report.check("Reset to Defaults restores defaults", reset, "");

		boolean pressed = this.ctx.computeOnClient(mc -> {
			EyeBallConfigScreen screen = (EyeBallConfigScreen) mc.gui.screen();
			for (AbstractWidget widget : screen.settingsList().allWidgets()) {
				if (widget instanceof net.minecraft.client.gui.components.Button button && button.getMessage().getString().equals("Player Selection...")) {
					button.onPress(null);
					return true;
				}
			}
			return false;
		});
		this.report.check("Player Selection button in the menu", pressed, "");
		this.ctx.waitForScreen(PlayerSelectionScreen.class);
		this.ctx.waitTicks(5);
		int rows = this.ctx.computeOnClient(mc -> ((PlayerSelectionScreen) mc.gui.screen()).rowCount());
		this.report.check("Player Selection lists the players", rows >= 1, rows + " row(s)");
		this.report.screenshot(this.ctx, "player_selection_singleplayer", "Player Selection in singleplayer");
		this.ctx.clickScreenButton("Done");
		this.ctx.waitForScreen(EyeBallConfigScreen.class);
		this.ctx.clickScreenButton("Done");
		this.ctx.waitTicks(3);
		this.report.check("Done closes the menu", this.ctx.computeOnClient(mc -> mc.gui.screen() == null), "");
	}

	// ------------------------------------------------------------------ multiplayer

	private void multiplayer() {
		this.report.section("Multiplayer (dedicated server with EyeBall)");
		this.config(c -> c.copyFrom(EyeBallConfig.defaults()));
		try (TestDedicatedServerContext server = this.ctx.worldBuilder().createServer();
			 TestDedicatedServerConnection connection = server.connect()) {
			connection.waitForChunksRender();
			server.runCommand("time set noon");
			this.ctx.runOnClient(mc -> {
				mc.options.setCameraType(CameraType.FIRST_PERSON);
				mc.options.fov().set(30);
			});
			UUID self = this.ctx.computeOnClient(mc -> mc.player.getUUID());
			this.report.check("client detects EyeBall on the server", this.ctx.computeOnClient(mc -> SyncedLooks.serverHasMod()), "");

			this.config(c -> {
				c.elmo = true;
				c.selfElmo = true;
			});
			connection.waitForServerboundPackets();
			int shared = server.computeOnServer(s -> EyeBallServer.selfLook(self));
			this.report.check("your chosen look is shared with the server", Appearance.elmo(shared) && Appearance.googly(shared), "server sees " + Appearance.describe(shared));

			this.config(c -> c.selfElmo = false);
			connection.waitForServerboundPackets();
			server.runCommand("eyeball elmo @a on");
			connection.waitForClientboundPackets();
			this.ctx.waitTicks(2);
			boolean forced = this.ctx.computeOnClient(mc -> Appearance.elmo(com.nottorzz.eyeball.client.target.TargetResolver.resolve(mc.player)));
			this.report.check("operator command /eyeball elmo forces Elmo on a player", forced, "");
			server.runCommand("eyeball elmo @a reset");
			connection.waitForClientboundPackets();
			this.ctx.waitTicks(2);
			boolean released = this.ctx.computeOnClient(mc -> !Appearance.elmo(com.nottorzz.eyeball.client.target.TargetResolver.resolve(mc.player)));
			this.report.check("/eyeball elmo reset gives control back", released, "");

			// A second player on the server.
			server.runOnServer(s -> spawnBob(s));
			connection.waitForClientboundPackets();
			this.ctx.waitTicks(20);
			boolean bobVisible = this.ctx.computeOnClient(mc -> mc.level.getPlayerByUUID(BOB) != null);
			this.report.check("second player visible to the client", bobVisible, "");
			this.ctx.getInput().lookAt(0.0F, 0.0F);
			this.ctx.waitTicks(20);
			FaceRenderData bobData = this.extractFor(BOB);
			this.report.check("other players get googly eyes (Apply to Everyone)", bobData != null && bobData.googly && !bobData.elmo, "");
			this.report.screenshot(this.ctx, "mp_other_player", "Another player on the server with googly eyes, seen in first person");

			server.runOnServer(s -> s.getPlayerList().broadcastSystemMessage(Component.literal("<GooglyBob> hahaha this mod is hilarious"), false));
			connection.waitForClientboundPackets();
			this.ctx.waitTicks(3);
			Expression bobMood = this.ctx.computeOnClient(mc -> FaceAnimationManager.INSTANCE.stateFor(BOB).activeMood());
			this.report.check("server-formatted chat makes the other player talk", bobMood == Expression.LAUGHING, "mood " + bobMood);
			this.report.screenshot(this.ctx, "mp_other_player_talking", "The other player laughing after their chat message");
			this.ctx.waitTicks(80);

			server.runOnServer(s -> EyeBallServer.relay(bobPlayer(s), FaceEventKind.EXPRESSION, Expression.SURPRISED, 60, false));
			connection.waitForClientboundPackets();
			this.ctx.waitTicks(4);
			Expression relayed = this.ctx.computeOnClient(mc -> FaceAnimationManager.INSTANCE.stateFor(BOB).activeMood());
			this.report.check("expressions are relayed between modded players", relayed == Expression.SURPRISED, "mood " + relayed);
			this.ctx.waitTicks(60);

			server.runOnServer(s -> {
				ServerPlayer bob = bobPlayer(s);
				ServerLevel level = (ServerLevel) bob.level();
				level.broadcastDamageEvent(bob, level.damageSources().generic());
			});
			connection.waitForClientboundPackets();
			this.ctx.waitTicks(5);
			FacePose bobHit = this.pose(BOB);
			this.report.check("other player's spiral eyes when they get hit", bobHit != null && bobHit.spiral, "");
			this.report.screenshot(this.ctx, "mp_other_player_hit", "The other player getting hit: spiral eyes");
			this.ctx.waitTicks(45);

			server.runOnServer(s -> {
				EyeBallServer.forcedLooks().set(BOB, "GooglyBob", ForcedLookStore.LookEffect.ELMO, Boolean.TRUE);
				EyeBallServer.broadcastLook(s, BOB);
			});
			connection.waitForClientboundPackets();
			this.ctx.waitTicks(3);
			FaceRenderData bobElmo = this.extractFor(BOB);
			this.report.check("server-synced Elmo look shows on the other player", bobElmo != null && bobElmo.elmo, "");
			this.report.screenshot(this.ctx, "mp_other_player_elmo", "The other player transformed into Elmo (synced from the server)");

			this.config(c -> c.getOrCreateOverride(BOB, "GooglyBob").elmo = Boolean.FALSE);
			FaceRenderData overridden = this.extractFor(BOB);
			this.report.check("Player Selection can remove an effect from one player", overridden != null && !overridden.elmo && overridden.googly, "");
			this.config(c -> c.getOrCreateOverride(BOB, "GooglyBob").googly = Boolean.FALSE);
			this.report.check("... and both effects from that player", this.extractFor(BOB) == null, "");
			this.config(c -> c.clearOverride(BOB));

			this.ctx.setScreen(() -> new PlayerSelectionScreen(null));
			this.ctx.waitForScreen(PlayerSelectionScreen.class);
			this.ctx.waitTicks(5);
			int rows = this.ctx.computeOnClient(mc -> ((PlayerSelectionScreen) mc.gui.screen()).rowCount());
			this.report.check("Player Selection lists both players", rows >= 2, rows + " rows");
			this.ctx.runOnClient(mc -> ((PlayerSelectionScreen) mc.gui.screen()).clickToggle(BOB, false));
			boolean rowClick = this.ctx.computeOnClient(mc -> {
				EyeBallConfig.PlayerOverride o = ConfigManager.get().override(BOB);
				return o != null && Boolean.FALSE.equals(o.googly);
			});
			this.report.check("clicking a player's switch stores a per-player choice", rowClick, "");
			this.report.screenshot(this.ctx, "player_selection_multiplayer", "Player Selection with another player (custom choice)");
			this.ctx.setScreen(() -> null);
			this.config(c -> c.clearOverride(BOB));

			this.performance(server, connection);
		}
	}

	private void performance(TestDedicatedServerContext server, TestDedicatedServerConnection connection) {
		this.report.section("Performance");
		server.runOnServer(s -> {
			ServerPlayer real = s.getPlayerList().getPlayers().getFirst();
			List<ServerPlayer> crowd = new ArrayList<>();
			for (int i = 0; i < 12; i++) {
				double angle = Math.toRadians(-60 + i * 10.9);
				Vec3 pos = real.position().add(Math.sin(angle) * 7.0, 0.0, Math.cos(angle) * 7.0);
				FakePlayer p = FakePlayer.get((ServerLevel) real.level(), new GameProfile(UUID.nameUUIDFromBytes(("crowd" + i).getBytes(StandardCharsets.UTF_8)), "Crowd" + i));
				p.snapTo(pos.x, pos.y, pos.z, 180.0F, 0.0F);
				p.setYHeadRot(180.0F);
				p.setYBodyRot(180.0F);
				crowd.add(p);
			}
			s.getPlayerList().broadcastAll(ClientboundPlayerInfoUpdatePacket.createPlayerInitializing(crowd));
			for (ServerPlayer p : crowd) {
				((ServerLevel) real.level()).addNewPlayer(p);
			}
		});
		connection.waitForClientboundPackets();
		this.ctx.runOnClient(mc -> mc.options.fov().set(70));
		this.ctx.getInput().lookAt(0.0F, 5.0F);
		this.ctx.waitTicks(40);
		long[] before = this.ctx.computeOnClient(mc -> new long[]{FaceRenderLayer.submittedFaces(), FaceRenderLayer.submitNanos(),
			FaceMeshBuilder.builtFaces(), FaceMeshBuilder.buildNanos()});
		this.ctx.waitTicks(100);
		long[] after = this.ctx.computeOnClient(mc -> new long[]{FaceRenderLayer.submittedFaces(), FaceRenderLayer.submitNanos(),
			FaceMeshBuilder.builtFaces(), FaceMeshBuilder.buildNanos()});
		long faces = after[0] - before[0];
		long built = after[2] - before[2];
		double submitMicros = faces == 0 ? -1 : (after[1] - before[1]) / 1000.0 / faces;
		double buildMicros = built == 0 ? -1 : (after[3] - before[3]) / 1000.0 / built;
		int simulated = this.ctx.computeOnClient(mc -> FaceAnimationManager.INSTANCE.simulatedLastTick());
		int fps = this.ctx.computeOnClient(Minecraft::getFps);
		int quads = this.ctx.computeOnClient(mc -> FaceMeshBuilder.lastQuadCount());
		this.report.check("14 animated faces rendered", simulated >= 13, simulated + " faces simulated per tick");
		this.report.check("CPU cost per face is small", buildMicros >= 0 && submitMicros + buildMicros < 500.0,
			String.format(Locale.ROOT, "%.1f us to submit + %.1f us to build the mesh per face per frame, %d faces measured, %d quads in the last face",
				submitMicros, buildMicros, built, quads));
		this.report.note("Frame rate with 14 animated faces on a software renderer (no GPU): " + fps + " FPS");
		this.report.screenshot(this.ctx, "perf_crowd", "A crowd of 13 other players, all with animated googly eyes");

		this.ctx.getInput().lookAt(180.0F, 0.0F);
		this.ctx.waitTicks(60);
		int hidden = this.ctx.computeOnClient(mc -> FaceAnimationManager.INSTANCE.simulatedLastTick());
		this.report.check("faces out of view stop being simulated", hidden <= 2, hidden + " faces simulated while looking away");
	}

	private static void spawnBob(MinecraftServer server) {
		ServerPlayer real = server.getPlayerList().getPlayers().getFirst();
		Vec3 pos = real.position().add(0.0, 0.0, 3.2);
		FakePlayer bob = FakePlayer.get((ServerLevel) real.level(), new GameProfile(BOB, "GooglyBob"));
		bob.snapTo(pos.x, pos.y, pos.z, 180.0F, 0.0F);
		bob.setYHeadRot(180.0F);
		bob.setYBodyRot(180.0F);
		server.getPlayerList().broadcastAll(ClientboundPlayerInfoUpdatePacket.createPlayerInitializing(List.of(bob)));
		((ServerLevel) real.level()).addNewPlayer(bob);
	}

	private static ServerPlayer bobPlayer(MinecraftServer server) {
		ServerPlayer real = server.getPlayerList().getPlayers().getFirst();
		return FakePlayer.get((ServerLevel) real.level(), new GameProfile(BOB, "GooglyBob"));
	}

	// ------------------------------------------------------------------ helpers

	private void config(Consumer<EyeBallConfig> change) {
		this.ctx.runOnClient(mc -> {
			change.accept(ConfigManager.get());
			ConfigManager.notifyChanged();
		});
		this.ctx.waitTick();
	}

	private FacePose pose(UUID player) {
		return this.ctx.computeOnClient(mc -> this.poseOnClient(player));
	}

	private FacePose poseOnClient(UUID player) {
		FaceState state = FaceAnimationManager.INSTANCE.existingState(player);
		return state == null ? null : state.pose(0.0F, ConfigManager.get());
	}

	private Expression mood(UUID player) {
		return this.ctx.computeOnClient(mc -> FaceAnimationManager.INSTANCE.stateFor(player).activeMood());
	}

	private FaceRenderData extract() {
		return this.ctx.computeOnClient(mc -> extractOnClient(mc, mc.player));
	}

	private FaceRenderData extractFor(UUID player) {
		return this.ctx.computeOnClient(mc -> {
			Player p = mc.level.getPlayerByUUID(player);
			return p instanceof AbstractClientPlayer clientPlayer ? extractOnClient(mc, clientPlayer) : null;
		});
	}

	private static FaceRenderData extractOnClient(Minecraft mc, AbstractClientPlayer player) {
		EntityRenderState state = mc.getEntityRenderDispatcher().extractEntity(player, 1.0F);
		return state.getData(FaceRenderData.KEY);
	}

	private float maxOver(int ticks, Function<Minecraft, Float> metric) {
		float max = Float.NEGATIVE_INFINITY;
		for (int i = 0; i < ticks; i++) {
			this.ctx.waitTick();
			max = Math.max(max, this.ctx.computeOnClient(metric::apply));
		}
		return max;
	}

	private float minOver(int ticks, Function<Minecraft, Float> metric) {
		float min = Float.POSITIVE_INFINITY;
		for (int i = 0; i < ticks; i++) {
			this.ctx.waitTick();
			min = Math.min(min, this.ctx.computeOnClient(metric::apply));
		}
		return min;
	}
}
