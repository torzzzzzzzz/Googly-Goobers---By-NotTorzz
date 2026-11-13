package com.nottorzz.eyeball.gametest;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.mojang.authlib.GameProfile;
import com.nottorzz.eyeball.Appearance;
import com.nottorzz.eyeball.Expression;
import com.nottorzz.eyeball.FaceEventKind;
import com.nottorzz.eyeball.client.anim.ExpressionDetector;
import com.nottorzz.eyeball.client.anim.FaceAnimationManager;
import com.nottorzz.eyeball.client.anim.FacePose;
import com.nottorzz.eyeball.client.anim.FaceState;
import com.nottorzz.eyeball.client.compat.McCompat;
import com.nottorzz.eyeball.client.config.ConfigManager;
import com.nottorzz.eyeball.client.config.EyeBallConfig;
import com.nottorzz.eyeball.client.gui.EyeBallConfigScreen;
import com.nottorzz.eyeball.client.gui.PlayerSelectionScreen;
import com.nottorzz.eyeball.client.gui.PreviewController;
import com.nottorzz.eyeball.client.gui.widget.ToggleSwitch;
import com.nottorzz.eyeball.client.gui.widget.ValueSlider;
import com.nottorzz.eyeball.client.input.EyeBallKeys;
import com.nottorzz.eyeball.client.render.FaceAnchor;
import com.nottorzz.eyeball.client.render.FaceMeshBuilder;
import com.nottorzz.eyeball.client.render.FaceRenderData;
import com.nottorzz.eyeball.client.render.FaceRenderLayer;
import com.nottorzz.eyeball.client.target.SyncedLooks;
import com.nottorzz.eyeball.client.target.TargetResolver;
import com.nottorzz.eyeball.compat.voice.VoiceActivity;
import com.nottorzz.eyeball.gametest.compat.GameTestCompat;
import com.nottorzz.eyeball.server.EyeBallServer;
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
 * Full in-game test of Googly Goobers in a real Minecraft client (run with {@code ./gradlew runClientGameTest}).
 * Covers rendering, every animation, hit reactions and their priority, every switch, the menu
 * with its preview and player selection, settings persistence across restarts (run twice), real
 * multiplayer sync against a dedicated server with a second player, and performance.
 * Writes {@code googly-goobers-test-report.md} and screenshots into the run directory.
 */
public final class EyeBallClientGameTest implements FabricClientGameTest {
	private static final UUID BOB = UUID.fromString("b0b0b0b0-1234-4321-8888-0000000000b0");
	private static final String MARKER = "googlygoobers-persistence-marker.json";
	private static final Gson GSON = new Gson();

	private final TestReport report = new TestReport();
	private ClientGameTestContext ctx;
	/** Fastest the mouth moves in one tick during ordinary talking (lip flaps), measured by talking(). */
	private float talkingFlapStep = 2.0F;
	/** Fastest the brows move in one tick during ordinary talking (their syllable bounce), measured by talking(). */
	private float talkingBrowStep = 0.8F;

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
			this.report.write(runDir.resolve("googly-goobers-test-report.md"));
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
			this.report.check("cartoon stars switch restored", loaded.cartoonStars == expected.get("cartoonStars").getAsBoolean(), "loaded " + loaded.cartoonStars);
			this.report.check("blinking switch restored", loaded.blinking == expected.get("blinking").getAsBoolean(), "loaded " + loaded.blinking);
			if (expected.has("eyeEnlargement")) {
				this.report.check("eye enlargement restored", Math.abs(loaded.eyeEnlargement - expected.get("eyeEnlargement").getAsFloat()) < 1e-4, "loaded " + loaded.eyeEnlargement);
				this.report.check("mouth opening restored", Math.abs(loaded.mouthOpening - expected.get("mouthOpening").getAsFloat()) < 1e-4, "loaded " + loaded.mouthOpening);
				this.report.check("overall exaggeration restored", Math.abs(loaded.exaggeration - expected.get("exaggeration").getAsFloat()) < 1e-4, "loaded " + loaded.exaggeration);
			}
			this.report.check("apply-to-everyone restored", loaded.everyoneGoogly == expected.get("everyoneGoogly").getAsBoolean(), "loaded " + loaded.everyoneGoogly);
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
			c.cartoonStars = false;
			c.blinking = false;
			c.everyoneGoogly = false;
			c.eyeEnlargement = 1.4F;
			c.mouthOpening = 0.8F;
			c.exaggeration = 1.25F;
			c.getOrCreateOverride(BOB, "GooglyBob").googly = Boolean.FALSE;
		});
		this.ctx.runOnClient(mc -> ConfigManager.save());
		JsonObject expected = new JsonObject();
		expected.addProperty("eyeSize", 1.35F);
		expected.addProperty("spiralSpeed", 2.25F);
		expected.addProperty("cartoonStars", false);
		expected.addProperty("blinking", false);
		expected.addProperty("everyoneGoogly", false);
		expected.addProperty("eyeEnlargement", 1.4F);
		expected.addProperty("mouthOpening", 0.8F);
		expected.addProperty("exaggeration", 1.25F);
		try {
			Files.writeString(runDir.resolve("config").resolve(MARKER), GSON.toJson(expected), StandardCharsets.UTF_8);
			this.report.note("Distinct settings saved to config/googlygoobers.json; the next launch verifies they were restored.");
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
		boolean previewShown = this.ctx.computeOnClient(mc -> McCompat.screen(mc) instanceof EyeBallConfigScreen s && s.previewPanel() != null);
		this.report.check("menu opens without a world, with preview", previewShown, "");
		this.report.screenshot(this.ctx, "menu_title_screen", "Settings menu opened from the title screen; preview uses the default skin");
		this.ctx.setScreen(() -> null);
	}

	// ------------------------------------------------------------------ singleplayer

	private void singleplayer() {
		try (TestSingleplayerContext world = this.ctx.worldBuilder().create()) {
			GameTestCompat.waitForChunksRender(world);
			TestServerContext server = world.getServer();
			server.runCommand("time set noon");
			server.runCommand("gamemode survival @a");
			server.runCommand("difficulty normal");
			this.ctx.runOnClient(mc -> {
				mc.options.setCameraType(CameraType.THIRD_PERSON_FRONT);
				mc.options.fov().set(30);
				if (!McCompat.isHudHidden(mc)) {
					McCompat.toggleHud(mc);
				}
			});
			this.look(0.0F, 0.0F);
			UUID self = this.ctx.computeOnClient(mc -> mc.player.getUUID());
			this.ctx.waitTicks(40);

			this.googlyRendering(self);
			this.eyeMovement(self);
			this.blinking(self);
			this.talking(self);
			this.screaming(self);
			this.expressions(self);
			this.talkingSliders(self);
			// Players can't be hurt during the first 3 seconds after joining.
			this.ctx.waitTicks(40);
			this.hitReaction(server, self);
			this.priority(server, self);
			this.transitions(server, self);
			this.individualSettings(server, self);
			this.masterSwitches(self);
			this.menuInWorld(self);
		}
	}

	private void googlyRendering(UUID self) {
		this.report.section("Googly eyes render");
		FaceRenderData data = this.extract();
		this.report.check("face attached to the player's render state", data != null && data.googly, data == null ? "no data" : "googly=" + data.googly);
		this.report.check("eyebrows enabled on the googly face", data != null && data.showBrows, "");
		Integer quads = this.ctx.computeOnClient(mc -> FaceMeshBuilder.lastQuadCount());
		this.report.check("3D face geometry built", quads != null && quads > 200, quads + " quads per face");
		this.report.screenshot(this.ctx, "googly_idle", "Idle googly face: rimmed 3D eyes, pupils with highlights, brows, mouth");
	}

	private void eyeMovement(UUID self) {
		this.report.section("Pupils move");
		FacePose before = this.pose(self);
		this.look(70.0F, -25.0F);
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
		this.look(0.0F, 0.0F);
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
		// A blink is sometimes a double blink, so look over the whole blink sequence.
		float open = this.maxOver(12, mc -> this.poseOnClient(self).eyeOpen[0]);
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
		this.report.section("Talking animation: big eyes, wide mouth");
		Sample idle = this.sample(self);
		this.report.note(String.format(Locale.ROOT, "Idle face: eye radius %.2f px, mouth %.2f px wide x %.2f px open (head is 8 x 8 px)",
			idle.layout.eyeRadius[0], idle.layout.mouthWidth, idle.layout.mouthHeight));
		this.ctx.runOnClient(mc -> mc.player.connection.sendChat("Hello everyone, look at my googly eyes today, they are so big"));
		List<Sample> talk = new ArrayList<>();
		boolean shot = false;
		for (int i = 0; i < 40; i++) {
			this.ctx.waitTick();
			Sample s = this.sample(self);
			talk.add(s);
			if (!shot && i >= 10 && s.layout.mouthHeight > 3.0F && s.eyeRatio(idle) > 1.5F) {
				this.report.screenshot(this.ctx, "talking", "Talking (chat): eyes swollen to about 1.6x, mouth wide open, brows up");
				shot = true;
			}
		}
		if (!shot) {
			this.report.screenshot(this.ctx, "talking", "Talking (chat)");
		}
		Stats eyes = Stats.of(talk.subList(14, talk.size()), s -> s.eyeRatio(idle));
		float popPeak = Stats.of(talk.subList(0, 10), s -> s.eyeRatio(idle)).max;
		Stats mouth = Stats.of(talk, s -> s.layout.mouthHeight);
		Stats width = Stats.of(talk, s -> s.layout.mouthWidth);
		Stats dShape = Stats.of(talk, s -> s.pose.mouthDShape);
		Stats gap = Stats.of(talk, s -> s.layout.eyeMouthGap);
		Stats bottom = Stats.of(talk, s -> s.layout.mouthBottom);
		Stats brow = Stats.of(talk, s -> s.pose.browLift[0]);
		Stats nod = Stats.of(talk, s -> Math.abs(s.pose.headNod));
		Stats sway = Stats.of(talk, s -> Math.abs(s.pose.headShake));
		float pupilTravel = 0.0F;
		float pupilApart = 0.0F;
		float flapStep = 0.0F;
		float browStep = 0.0F;
		float eyeBob = 0.0F;
		for (int i = 1; i < talk.size(); i++) {
			FacePose a = talk.get(i - 1).pose;
			FacePose b = talk.get(i).pose;
			pupilTravel += Math.abs(b.pupilX[0] - a.pupilX[0]) + Math.abs(b.pupilY[0] - a.pupilY[0]);
			pupilApart = Math.max(pupilApart, Math.abs(b.pupilX[0] - b.pupilX[1]) + Math.abs(b.pupilY[0] - b.pupilY[1]));
			flapStep = Math.max(flapStep, Math.abs(talk.get(i).layout.mouthHeight - talk.get(i - 1).layout.mouthHeight));
			browStep = Math.max(browStep, Math.max(Math.abs(b.browLift[0] - a.browLift[0]), Math.abs(b.browLift[1] - a.browLift[1])));
			if (i >= 14) {
				eyeBob = Math.max(eyeBob, Math.abs(talk.get(i).layout.eyeV[0] - talk.get(i - 1).layout.eyeV[0]));
			}
		}
		this.talkingFlapStep = flapStep;
		this.talkingBrowStep = browStep;
		this.report.check("eyes grow to 1.5x-1.8x while talking", eyes.avg >= 1.45F && eyes.avg <= 1.85F && eyes.max >= 1.6F,
			String.format(Locale.ROOT, "average x%.2f, range x%.2f - x%.2f (was x1.05 before)", eyes.avg, eyes.min, eyes.max));
		this.report.check("eyes pop when talking starts", popPeak >= eyes.avg + 0.08F,
			String.format(Locale.ROOT, "first half second peaks at x%.2f, then about x%.2f", popPeak, eyes.avg));
		this.report.check("pupils keep wobbling independently", pupilTravel > 0.6F && pupilApart > 0.02F,
			String.format(Locale.ROOT, "pupil travel %.2f eye radii in 2 s, max difference between the eyes %.2f", pupilTravel, pupilApart));
		this.report.check("mouth opens much wider", mouth.max >= 3.2F,
			String.format(Locale.ROOT, "up to %.2f px tall (idle %.2f px, the old maximum was 1.56 px)", mouth.max, idle.layout.mouthHeight));
		this.report.check("mouth stretches sideways", width.max >= idle.layout.mouthWidth * 1.15F,
			String.format(Locale.ROOT, "up to %.2f px wide (idle %.2f px)", width.max, idle.layout.mouthWidth));
		this.report.check("several mouth shapes while talking", (width.max - width.min) / idle.layout.mouthWidth >= 0.25F && dShape.max - dShape.min >= 0.2F,
			String.format(Locale.ROOT, "width %.2f - %.2f px, flat-top amount %.2f - %.2f", width.min, width.max, dShape.min, dShape.max));
		this.report.check("big eyes never cover the mouth", gap.min >= 0.15F, String.format(Locale.ROOT, "smallest eye-mouth gap %.2f px", gap.min));
		this.report.check("eyes stay put while the mouth flaps (no bobbing)", eyeBob <= 0.6F,
			String.format(Locale.ROOT, "eyes move at most %.2f px per tick while the mouth moves up to %.2f px per tick", eyeBob, flapStep));
		this.report.check("wide mouth stays on the face", bottom.min >= FaceAnchor.PLAYER.chinLimit() - 0.01F,
			String.format(Locale.ROOT, "lowest point %.2f px (chin limit %.2f)", bottom.min, FaceAnchor.PLAYER.chinLimit()));
		this.report.check("eyebrows bounce while talking", brow.max > idle.pose.browLift[0] + 0.6F,
			String.format(Locale.ROOT, "brow lift %.2f -> %.2f px", idle.pose.browLift[0], brow.max));
		this.report.check("head nods and sways while talking", nod.max > 0.03F && sway.max > 0.02F,
			String.format(Locale.ROOT, "nod up to %.3f rad, sway up to %.3f rad", nod.max, sway.max));

		this.waitForTalkEnd(self, 120);
		List<Sample> after = new ArrayList<>();
		for (int i = 0; i < 30; i++) {
			this.ctx.waitTick();
			after.add(this.sample(self));
		}
		Stats back = Stats.of(after, s -> s.eyeRatio(idle));
		float maxStep = 0.0F;
		for (int i = 1; i < after.size(); i++) {
			maxStep = Math.max(maxStep, Math.abs(after.get(i).eyeRatio(idle) - after.get(i - 1).eyeRatio(idle)));
		}
		float last = after.getLast().eyeRatio(idle);
		this.report.check("eyes shrink back smoothly when talking stops", back.min >= 0.94F && Math.abs(last - 1.0F) < 0.05F && maxStep < 0.15F,
			String.format(Locale.ROOT, "x%.2f -> x%.2f in 1.5 s, never below x%.2f, biggest step per tick %.3f", after.getFirst().eyeRatio(idle), last, back.min, maxStep));
		float closed = after.getLast().pose.mouthOpen;
		this.report.check("mouth closes again after talking", closed < 0.12F, String.format(Locale.ROOT, "open %.2f", closed));

		this.chatExpression(self, "hahahaha that is so funny", Expression.LAUGHING);
		this.chatExpression(self, "WHAT ARE YOU DOING", Expression.WIDE_OPEN);
		this.chatExpression(self, "wow no way?!", Expression.SURPRISED);
		this.chatExpression(self, "ok", Expression.SMALL_TALK);
		this.chatExpression(self, "grr I am so mad", Expression.ANGRY);
		this.chatExpression(self, "yay lets go!!", Expression.EXCITED);
	}

	private void screaming(UUID self) {
		this.report.section("Screaming");
		for (String scream : List.of("AAAAAAHHHHHH", "NOOOOOOO", "eeeeek a spider", "HELP ME!!", "RUN AWAYYYY", "😱")) {
			Expression detected = ExpressionDetector.detect(scream);
			this.report.check("\"" + scream + "\" is detected as screaming", detected == Expression.SCREAMING, "got " + detected);
		}
		for (String calm : List.of("WHAT ARE YOU DOING", "aah ok", "no", "Hello there")) {
			Expression detected = ExpressionDetector.detect(calm);
			this.report.check("\"" + calm + "\" is not a scream", detected != Expression.SCREAMING, "got " + detected);
		}

		Sample idle = this.sample(self);
		this.ctx.runOnClient(mc -> mc.player.connection.sendChat("AAAAAAAAHHHHHHH A CREEPER"));
		List<Sample> scream = new ArrayList<>();
		for (int i = 0; i < 26; i++) {
			this.ctx.waitTick();
			scream.add(this.sample(self));
			if (i == 14) {
				this.report.screenshot(this.ctx, "screaming", "Screaming: enormous trembling eyes, huge oval mouth with uvula, brows up, head shaking");
			}
		}
		this.report.check("chat \"AAAAAAAAHHHHHHH A CREEPER\" makes a screaming face", scream.get(1).mood == Expression.SCREAMING, "mood " + scream.get(1).mood);
		List<Sample> held = scream.subList(12, scream.size());
		float screamEyes = Stats.of(held, x -> x.eyeRatio(idle)).avg;
		int swell = 0;
		while (swell < scream.size() && scream.get(swell).eyeRatio(idle) < 1.0F + (screamEyes - 1.0F) * 0.9F) {
			swell++;
		}
		int mouthOpen = 0;
		float screamMouth = Stats.of(held, x -> x.layout.mouthHeight).avg;
		while (mouthOpen < scream.size() && scream.get(mouthOpen).layout.mouthHeight < screamMouth * 0.9F) {
			mouthOpen++;
		}
		this.report.check("eyes and mouth swell into the scream over several ticks (no snap)", swell >= 2 && mouthOpen >= 2,
			String.format(Locale.ROOT, "eyes x1.00 -> x%.2f in %d ticks, mouth %.2f -> %.2f px in %d ticks",
				screamEyes, swell + 1, idle.layout.mouthHeight, screamMouth, mouthOpen + 1));
		Stats eyes = Stats.of(held, s -> s.eyeRatio(idle));
		Stats mouth = Stats.of(held, s -> s.layout.mouthHeight);
		Sample widest = held.stream().max((a, b) -> Float.compare(a.layout.mouthHeight, b.layout.mouthHeight)).orElseThrow();
		Stats uvula = Stats.of(held, s -> s.pose.mouthUvula);
		Stats brows = Stats.of(held, s -> s.pose.browLift[0]);
		Stats pupils = Stats.of(held, s -> s.pose.pupilScale);
		Stats shake = Stats.of(scream, s -> Math.abs(s.pose.headShake));
		Stats nod = Stats.of(held, s -> s.pose.headNod);
		Stats gap = Stats.of(scream, s -> s.layout.eyeMouthGap);
		Stats bottom = Stats.of(scream, s -> s.layout.mouthBottom);
		this.report.check("screaming eyes are very large", eyes.avg >= 1.85F && eyes.max <= 2.7F,
			String.format(Locale.ROOT, "x%.2f on average (x%.2f - x%.2f, trembling)", eyes.avg, eyes.min, eyes.max));
		this.report.check("mouth opens into a huge oval", mouth.min >= 3.8F && widest.layout.mouthHeight >= 4.2F
				&& widest.layout.mouthHeight >= widest.layout.mouthWidth * 0.9F,
			String.format(Locale.ROOT, "%.2f px tall x %.2f px wide at its widest, never under %.2f px tall", widest.layout.mouthHeight, widest.layout.mouthWidth, mouth.min));
		this.report.check("uvula shows in the screaming mouth", uvula.avg > 0.5F, String.format(Locale.ROOT, "uvula %.2f", uvula.avg));
		this.report.check("eyebrows shoot up", brows.avg >= 1.0F, String.format(Locale.ROOT, "lift %.2f px", brows.avg));
		this.report.check("tiny terrified pupils", pupils.avg <= 0.7F, String.format(Locale.ROOT, "pupil scale %.2f", pupils.avg));
		this.report.check("head shakes and is thrown back", shake.max >= 0.06F && nod.avg <= -0.08F,
			String.format(Locale.ROOT, "shake up to %.3f rad, head tilted back %.3f rad", shake.max, nod.avg));
		this.report.check("screaming face never clips", gap.min >= 0.15F && bottom.min >= FaceAnchor.PLAYER.chinLimit() - 0.01F,
			String.format(Locale.ROOT, "smallest eye-mouth gap %.2f px, lowest mouth point %.2f px", gap.min, bottom.min));
		this.waitForTalkEnd(self, 80);
		this.ctx.waitTicks(40);
		Sample calm = this.sample(self);
		this.report.check("face calms down after screaming", calm.mood == Expression.NEUTRAL && calm.eyeRatio(idle) < 1.08F && calm.pose.mouthOpen < 0.12F,
			String.format(Locale.ROOT, "mood %s, eyes x%.2f, mouth %.2f", calm.mood, calm.eyeRatio(idle), calm.pose.mouthOpen));

		this.makeFace(Expression.SCREAMING);
		Sample keyed = this.sample(self);
		this.report.check("\"Make a Face: Screaming\" key screams", keyed.mood == Expression.SCREAMING && keyed.eyeRatio(idle) >= 1.75F,
			String.format(Locale.ROOT, "mood %s, eyes x%.2f", keyed.mood, keyed.eyeRatio(idle)));
		this.ctx.waitTicks(90);
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

	/** Talks for a moment with the given settings and measures the face. */
	private TalkMeasure measureTalk(UUID self, Consumer<EyeBallConfig> settings) {
		this.config(c -> {
			c.copyFrom(EyeBallConfig.defaults());
			settings.accept(c);
		});
		this.ctx.waitTicks(30);
		Sample idle = this.sample(self);
		this.ctx.runOnClient(mc -> mc.player.connection.sendChat("Testing the talking sliders now"));
		List<Sample> talk = new ArrayList<>();
		for (int i = 0; i < 34; i++) {
			this.ctx.waitTick();
			talk.add(this.sample(self));
		}
		this.waitForTalkEnd(self, 80);
		int settle = 0;
		for (; settle < 60; settle++) {
			Sample s = this.sample(self);
			if (Math.abs(s.eyeRatio(idle) - 1.0F) < 0.05F) {
				break;
			}
			this.ctx.waitTick();
		}
		this.config(c -> c.copyFrom(EyeBallConfig.defaults()));
		List<Sample> steady = talk.subList(12, talk.size());
		return new TalkMeasure(Stats.of(steady, s -> s.eyeRatio(idle)).avg, Stats.of(talk, s -> s.layout.mouthHeight).max,
			Stats.of(talk, s -> Math.abs(s.pose.headShake)).max, settle);
	}

	private void talkingSliders(UUID self) {
		this.report.section("Talking sliders (Eye Enlargement, Mouth Opening, Animation Speed, Overall Exaggeration)");
		TalkMeasure normal = this.measureTalk(self, c -> {
		});
		TalkMeasure noGrowth = this.measureTalk(self, c -> c.eyeEnlargement = 0.0F);
		TalkMeasure maxGrowth = this.measureTalk(self, c -> c.eyeEnlargement = 2.0F);
		this.report.check("Eye Enlargement 0: eyes stay normal size", noGrowth.eyes() <= 1.12F, String.format(Locale.ROOT, "x%.2f", noGrowth.eyes()));
		this.report.check("Eye Enlargement 2: eyes grow even more", maxGrowth.eyes() >= normal.eyes() + 0.35F,
			String.format(Locale.ROOT, "x%.2f (default x%.2f)", maxGrowth.eyes(), normal.eyes()));
		TalkMeasure smallMouth = this.measureTalk(self, c -> c.mouthOpening = 0.5F);
		TalkMeasure bigMouth = this.measureTalk(self, c -> c.mouthOpening = 1.8F);
		this.report.check("Mouth Opening changes how wide the mouth opens", bigMouth.mouth() >= smallMouth.mouth() * 1.5F,
			String.format(Locale.ROOT, "0.50x: %.2f px, 1.00x: %.2f px, 1.80x: %.2f px", smallMouth.mouth(), normal.mouth(), bigMouth.mouth()));
		TalkMeasure calm = this.measureTalk(self, c -> c.exaggeration = 0.5F);
		TalkMeasure wild = this.measureTalk(self, c -> c.exaggeration = 1.8F);
		this.report.check("Overall Exaggeration scales everything", (wild.eyes() - 1.0F) >= 2.0F * (calm.eyes() - 1.0F)
				&& wild.mouth() > calm.mouth() * 1.3F && wild.sway() > calm.sway() * 2.0F,
			String.format(Locale.ROOT, "0.50x: eyes x%.2f, mouth %.2f px, sway %.3f rad | 1.80x: eyes x%.2f, mouth %.2f px, sway %.3f rad",
				calm.eyes(), calm.mouth(), calm.sway(), wild.eyes(), wild.mouth(), wild.sway()));
		TalkMeasure slow = this.measureTalk(self, c -> c.animationSpeed = 0.5F);
		TalkMeasure fast = this.measureTalk(self, c -> c.animationSpeed = 2.0F);
		this.report.check("Animation Speed changes how fast the face moves", slow.settleTicks() >= fast.settleTicks() * 2,
			String.format(Locale.ROOT, "eyes back to normal after talking in %d ticks at 0.50x, %d at 1.00x, %d at 2.00x",
				slow.settleTicks(), normal.settleTicks(), fast.settleTicks()));
	}

	/** One long sequence through every animation, checking that nothing jumps between ticks or overlaps. */
	private void transitions(TestServerContext server, UUID self) {
		this.report.section("Smooth transitions: idle -> talking -> screaming -> hit -> talking -> idle");
		Sample idle = this.sample(self);
		this.ctx.runOnClient(mc -> mc.player.connection.sendChat("This is a really long message so I keep on talking and talking for quite a while longer, okay"));
		List<Expression> moods = new ArrayList<>();
		Sample previous = idle;
		float maxEyeStep = 0.0F;
		float maxMoveStep = 0.0F;
		float maxMouthStep = 0.0F;
		float maxBrowStep = 0.0F;
		float minGap = Float.POSITIVE_INFINITY;
		float minBottom = Float.POSITIVE_INFINITY;
		float[] mouth = new float[190];
		for (int t = 0; t < 190; t++) {
			if (t == 22) {
				this.ctx.runOnClient(mc -> EyeBallKeys.makeFace(mc, Expression.SCREAMING));
			}
			if (t == 50) {
				server.runCommand("damage @p 1 minecraft:generic");
			}
			this.ctx.waitTick();
			Sample s = this.sample(self);
			if (moods.isEmpty() || moods.getLast() != s.mood) {
				moods.add(s.mood);
			}
			for (int i = 0; i < 2; i++) {
				maxEyeStep = Math.max(maxEyeStep, Math.abs(s.pose.eyeScale[i] - previous.pose.eyeScale[i]));
				maxMoveStep = Math.max(maxMoveStep, (float) Math.hypot(s.layout.eyeU[i] - previous.layout.eyeU[i], s.layout.eyeV[i] - previous.layout.eyeV[i]));
				maxBrowStep = Math.max(maxBrowStep, Math.abs(s.pose.browLift[i] - previous.pose.browLift[i]));
			}
			maxMouthStep = Math.max(maxMouthStep, Math.abs(s.layout.mouthHeight - previous.layout.mouthHeight));
			mouth[t] = s.layout.mouthHeight;
			minGap = Math.min(minGap, s.layout.eyeMouthGap);
			minBottom = Math.min(minBottom, s.layout.mouthBottom);
			previous = s;
		}
		int talking = moods.indexOf(Expression.TALKING);
		int scream = moods.indexOf(Expression.SCREAMING);
		int hit = moods.indexOf(Expression.DIZZY);
		boolean order = talking >= 0 && scream > talking && hit > scream && moods.lastIndexOf(Expression.TALKING) > hit
			&& moods.getLast() == Expression.NEUTRAL;
		this.report.check("every animation played in priority order", order, String.valueOf(moods));
		this.report.check("eye size never jumps", maxEyeStep <= 0.45F,
			String.format(Locale.ROOT, "largest change in one tick: x%.3f (includes the deliberate scream tremble and hit pop)", maxEyeStep));
		this.report.check("eyes never jump around", maxMoveStep <= 1.5F, String.format(Locale.ROOT, "largest move in one tick: %.2f px", maxMoveStep));
		// The mouth flaps fast while talking, so check the two big mouth changes directly: they must
		// take several ticks, not happen in one jump.
		float screamSize = average(mouth, 38, 49);
		float shockedSize = average(mouth, 62, 73);
		int opening = ticksUntil(mouth, 22, h -> h >= screamSize * 0.9F);
		int closing = ticksUntil(mouth, 50, h -> Math.abs(h - shockedSize) <= screamSize * 0.1F);
		this.report.check("mouth opens into the scream over several ticks", opening >= 3,
			String.format(Locale.ROOT, "%.2f px scream mouth reached in %d ticks", screamSize, opening));
		this.report.check("mouth shrinks to the shocked mouth over several ticks when hit", closing >= 3,
			String.format(Locale.ROOT, "%.2f px -> %.2f px in %d ticks", screamSize, shockedSize, closing));
		this.report.note(String.format(Locale.ROOT, "Largest mouth change in one tick: %.2f px (ordinary talking flaps up to %.2f px per tick)",
			maxMouthStep, this.talkingFlapStep));
		this.report.check("eyebrows never move faster than their ordinary talking bounce", maxBrowStep <= Math.max(0.8F, this.talkingBrowStep * 1.25F),
			String.format(Locale.ROOT, "largest change in one tick: %.2f px (talking bounce: up to %.2f px per tick)", maxBrowStep, this.talkingBrowStep));
		this.report.check("eyes never overlap the mouth in any of them", minGap >= 0.1F, String.format(Locale.ROOT, "smallest gap %.2f px", minGap));
		this.report.check("mouth never hangs off the chin", minBottom >= FaceAnchor.PLAYER.chinLimit() - 0.01F, String.format(Locale.ROOT, "lowest point %.2f px", minBottom));
		Sample end = this.sample(self);
		this.report.check("back to the normal face at the end", Math.abs(end.eyeRatio(idle) - 1.0F) < 0.06F && end.pose.mouthOpen < 0.12F,
			String.format(Locale.ROOT, "eyes x%.2f, mouth %.2f", end.eyeRatio(idle), end.pose.mouthOpen));
		server.runCommand("effect give @p minecraft:instant_health 1 1 true");
		this.ctx.waitTicks(10);
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
		float peakMouth = this.sample(self).layout.mouthHeight;
		this.report.check("eyes become bigger", peakEye > 1.1F, String.format(Locale.ROOT, "peak x%.2f", peakEye));
		this.report.check("shocked open mouth", peakMouth > 1.8F, String.format(Locale.ROOT, "%.2f px open", peakMouth));
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
		this.look(60.0F, 30.0F);
		this.ctx.waitTicks(25);
		FacePose still = this.pose(self);
		this.report.check("Eye Movement OFF: pupils stay centred", Math.abs(still.pupilX[0]) < 0.15F && Math.abs(still.pupilY[0] + 0.1F) < 0.15F,
			String.format(Locale.ROOT, "pupil (%.2f, %.2f)", still.pupilX[0], still.pupilY[0]));
		this.config(c -> c.eyeMovement = true);
		this.look(0.0F, 0.0F);

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

	private void masterSwitches(UUID self) {
		this.report.section("Main ON/OFF switches");
		this.config(c -> c.googlyEyes = false);
		FaceRenderData none = this.extract();
		this.report.check("Googly Eyes OFF: effect disappears immediately", none == null, "");
		this.report.screenshot(this.ctx, "all_off", "Googly Eyes OFF: plain vanilla player");
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
		this.report.check("G key opens the Googly Goobers menu", true, "");
		this.ctx.waitTicks(10);
		this.report.screenshot(this.ctx, "menu", "The Googly Goobers menu with live preview");

		boolean toggled = this.ctx.computeOnClient(mc -> {
			EyeBallConfigScreen screen = (EyeBallConfigScreen) McCompat.screen(mc);
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
			EyeBallConfigScreen screen = (EyeBallConfigScreen) McCompat.screen(mc);
			for (AbstractWidget widget : screen.settingsList().allWidgets()) {
				if (widget instanceof ToggleSwitch toggle && widget.getMessage().getString().equals("Googly Eyes")) {
					toggle.onPress(null);
				}
			}
			return null;
		});
		this.report.check("menu switch turns it back ON", this.ctx.computeOnClient(mc -> ConfigManager.get().googlyEyes), "");

		boolean sliders = this.ctx.computeOnClient(mc -> {
			EyeBallConfigScreen screen = (EyeBallConfigScreen) McCompat.screen(mc);
			int found = 0;
			for (AbstractWidget widget : screen.settingsList().allWidgets()) {
				String label = widget.getMessage().getString();
				if (widget instanceof ValueSlider && (label.startsWith("Eye Enlargement:") || label.startsWith("Mouth Opening:")
					|| label.startsWith("Animation Speed:") || label.startsWith("Overall Exaggeration:"))) {
					found++;
				}
			}
			return found == 4;
		});
		this.report.check("menu has Eye Enlargement, Mouth Opening, Animation Speed and Overall Exaggeration sliders", sliders, "");
		boolean sliderWorks = this.ctx.computeOnClient(mc -> {
			EyeBallConfigScreen screen = (EyeBallConfigScreen) McCompat.screen(mc);
			for (AbstractWidget widget : screen.settingsList().allWidgets()) {
				if (widget instanceof ValueSlider slider && widget.getMessage().getString().startsWith("Eye Enlargement:")) {
					slider.setActualValue(1.5);
					boolean applied = Math.abs(ConfigManager.get().eyeEnlargement - 1.5F) < 1e-4 && widget.getMessage().getString().endsWith("1.50x");
					// Scroll the list so the new section is in the screenshot.
					screen.settingsList().scrollToWidget(widget, 24);
					return applied;
				}
			}
			return false;
		});
		this.report.check("moving the Eye Enlargement slider changes the setting", sliderWorks, "");
		// Park the mouse away from the list so no tooltip covers the screenshot.
		this.ctx.getInput().setCursorPos(2.0, 2.0);
		this.ctx.waitTicks(3);
		this.report.screenshot(this.ctx, "menu_talking_sliders", "The new Talking & Expressions sliders");
		this.ctx.runOnClient(mc -> ConfigManager.get().eyeEnlargement = 1.0F);

		for (PreviewController.Mode mode : PreviewController.Mode.values()) {
			this.ctx.runOnClient(mc -> ((EyeBallConfigScreen) McCompat.screen(mc)).previewController().setMode(mode));
			this.ctx.waitTicks(mode.isHit() ? 12 : mode == PreviewController.Mode.TALKING ? 16 : 20);
			this.report.screenshot(this.ctx, "preview_" + mode.name().toLowerCase(Locale.ROOT), "Preview: " + mode.label().getString());
		}
		this.ctx.runOnClient(mc -> {
			EyeBallConfigScreen screen = (EyeBallConfigScreen) McCompat.screen(mc);
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
			EyeBallConfigScreen screen = (EyeBallConfigScreen) McCompat.screen(mc);
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
		int rows = this.ctx.computeOnClient(mc -> ((PlayerSelectionScreen) McCompat.screen(mc)).rowCount());
		this.report.check("Player Selection lists the players", rows >= 1, rows + " row(s)");
		this.report.screenshot(this.ctx, "player_selection_singleplayer", "Player Selection in singleplayer");
		this.ctx.clickScreenButton("Done");
		this.ctx.waitForScreen(EyeBallConfigScreen.class);
		this.ctx.clickScreenButton("Done");
		this.ctx.waitTicks(3);
		this.report.check("Done closes the menu", this.ctx.computeOnClient(mc -> McCompat.screen(mc) == null), "");
	}

	// ------------------------------------------------------------------ multiplayer

	private void multiplayer() {
		this.report.section("Multiplayer (dedicated server with Googly Goobers)");
		this.config(c -> c.copyFrom(EyeBallConfig.defaults()));
		try (TestDedicatedServerContext server = this.ctx.worldBuilder().createServer();
			 GameTestCompat.Connection connection = GameTestCompat.connect(this.ctx, server)) {
			connection.waitForChunksRender();
			server.runCommand("time set noon");
			this.ctx.runOnClient(mc -> {
				mc.options.setCameraType(CameraType.FIRST_PERSON);
				mc.options.fov().set(30);
			});
			UUID self = this.ctx.computeOnClient(mc -> mc.player.getUUID());
			this.report.check("client detects Googly Goobers on the server", this.ctx.computeOnClient(mc -> SyncedLooks.serverHasMod()), "");

			connection.waitForServerboundPackets();
			int shared = server.computeOnServer(s -> EyeBallServer.selfLook(self));
			this.report.check("your chosen look is shared with the server", Appearance.googly(shared), "server sees " + Appearance.describe(shared));
			this.config(c -> c.selfGoogly = false);
			connection.waitForServerboundPackets();
			int sharedOff = server.computeOnServer(s -> EyeBallServer.selfLook(self));
			this.report.check("turning Apply to Myself off is shared too", !Appearance.googly(sharedOff), "server sees " + Appearance.describe(sharedOff));

			server.runCommand("googlygoobers eyes @a on");
			connection.waitForClientboundPackets();
			this.ctx.waitTicks(2);
			boolean forced = this.ctx.computeOnClient(mc -> Appearance.googly(TargetResolver.resolve(mc.player)));
			this.report.check("/googlygoobers eyes @a on forces googly eyes on a player", forced, "");
			this.config(c -> c.selfGoogly = true);
			server.runCommand("googly eyes @a off");
			connection.waitForClientboundPackets();
			this.ctx.waitTicks(2);
			boolean forcedOff = this.ctx.computeOnClient(mc -> !Appearance.googly(TargetResolver.resolve(mc.player)));
			this.report.check("/googly alias: eyes @a off forces them off (even with Apply to Myself on)", forcedOff, "");
			String forcedFile = server.computeOnServer(s -> {
				java.nio.file.Path file = s.getWorldPath(net.minecraft.world.level.storage.LevelResource.ROOT).resolve("googlygoobers_forced_looks.json");
				try {
					return Files.isRegularFile(file) ? Files.readString(file) : "";
				} catch (IOException e) {
					return "";
				}
			});
			this.report.check("forced looks are saved with the world", forcedFile.contains("\"googly\": false"), forcedFile.isEmpty() ? "no file" : "googlygoobers_forced_looks.json written");
			server.runCommand("googlygoobers eyes @a reset");
			connection.waitForClientboundPackets();
			this.ctx.waitTicks(2);
			boolean released = this.ctx.computeOnClient(mc -> Appearance.googly(TargetResolver.resolve(mc.player)));
			this.report.check("/googlygoobers eyes @a reset gives control back", released, "");

			// A second player on the server.
			server.runOnServer(s -> spawnBob(s));
			connection.waitForClientboundPackets();
			this.ctx.waitTicks(20);
			boolean bobVisible = this.ctx.computeOnClient(mc -> mc.level.getPlayerByUUID(BOB) != null);
			this.report.check("second player visible to the client", bobVisible, "");
			// Looking slightly up, so the other player's big eyes and brows fit in the screenshots.
			this.look(0.0F, -8.0F);
			this.ctx.waitTicks(20);
			FaceRenderData bobData = this.extractFor(BOB);
			this.report.check("other players get googly eyes (Apply to Everyone)", bobData != null && bobData.googly, "");
			this.report.screenshot(this.ctx, "mp_other_player", "Another player on the server with googly eyes, seen in first person");
			this.watchBobTalk(server, connection);

			server.runOnServer(s -> s.getPlayerList().broadcastSystemMessage(Component.literal("<GooglyBob> hahaha this mod is hilarious"), false));
			connection.waitForClientboundPackets();
			this.ctx.waitTicks(3);
			Expression bobMood = this.ctx.computeOnClient(mc -> FaceAnimationManager.INSTANCE.stateFor(BOB).activeMood());
			this.report.check("server-formatted chat makes the other player talk", bobMood == Expression.LAUGHING, "mood " + bobMood);
			this.ctx.waitTicks(5);
			this.report.screenshot(this.ctx, "mp_other_player_laughing", "The other player laughing after their chat message");
			this.ctx.waitTicks(80);
			this.watchBobScream(server, connection);
			this.watchBobVoice();

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

			// Without "Apply to Everyone", the other player only gets googly eyes when the server says so.
			this.config(c -> c.everyoneGoogly = false);
			this.report.check("Apply to Everyone OFF: the other player looks normal", this.extractFor(BOB) == null, "");
			server.runOnServer(s -> {
				EyeBallServer.forcedLooks().set(BOB, "GooglyBob", Boolean.TRUE);
				EyeBallServer.broadcastLook(s, BOB);
			});
			connection.waitForClientboundPackets();
			this.ctx.waitTicks(3);
			FaceRenderData bobSynced = this.extractFor(BOB);
			this.report.check("server-synced googly look shows on the other player", bobSynced != null && bobSynced.googly, "");
			this.report.screenshot(this.ctx, "mp_other_player_synced", "The other player's googly eyes, synced from the server");
			this.config(c -> c.showSyncedLooks = false);
			this.report.check("Show Synced Looks OFF hides it again", this.extractFor(BOB) == null, "");
			this.config(c -> {
				c.showSyncedLooks = true;
				c.everyoneGoogly = true;
			});
			server.runOnServer(s -> {
				EyeBallServer.forcedLooks().set(BOB, "GooglyBob", null);
				EyeBallServer.broadcastLook(s, BOB);
			});
			connection.waitForClientboundPackets();

			this.config(c -> c.getOrCreateOverride(BOB, "GooglyBob").googly = Boolean.FALSE);
			this.report.check("Player Selection can remove googly eyes from one player", this.extractFor(BOB) == null, "");
			FaceRenderData selfStill = this.extract();
			this.report.check("... without affecting anyone else", selfStill == null || selfStill.googly, "");
			this.config(c -> c.clearOverride(BOB));

			this.ctx.setScreen(() -> new PlayerSelectionScreen(null));
			this.ctx.waitForScreen(PlayerSelectionScreen.class);
			this.ctx.waitTicks(5);
			int rows = this.ctx.computeOnClient(mc -> ((PlayerSelectionScreen) McCompat.screen(mc)).rowCount());
			this.report.check("Player Selection lists both players", rows >= 2, rows + " rows");
			this.ctx.runOnClient(mc -> ((PlayerSelectionScreen) McCompat.screen(mc)).clickToggle(BOB));
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

	/** What you see when another player talks: the main reason the animations are exaggerated. */
	private void watchBobTalk(TestDedicatedServerContext server, GameTestCompat.Connection connection) {
		this.report.section("Watching another player talk");
		Sample idle = this.sample(BOB);
		server.runOnServer(s -> s.getPlayerList().broadcastSystemMessage(
			Component.literal("<GooglyBob> Hello there, did you see how big my eyes get when I talk"), false));
		connection.waitForClientboundPackets();
		List<Sample> talk = new ArrayList<>();
		boolean shot = false;
		for (int i = 0; i < 36; i++) {
			this.ctx.waitTick();
			Sample s = this.sample(BOB);
			talk.add(s);
			if (!shot && i >= 10 && s.layout.mouthHeight > 3.2F && s.eyeRatio(idle) > 1.5F) {
				this.report.screenshot(this.ctx, "mp_other_player_talking", "The other player talking: eyes about 1.6x, mouth wide open");
				shot = true;
			}
		}
		if (!shot) {
			this.report.screenshot(this.ctx, "mp_other_player_talking", "The other player talking");
		}
		Stats eyes = Stats.of(talk.subList(12, talk.size()), x -> x.eyeRatio(idle));
		Stats mouth = Stats.of(talk, x -> x.layout.mouthHeight);
		Stats gap = Stats.of(talk, x -> x.layout.eyeMouthGap);
		this.report.check("other player's eyes swell up while they talk", eyes.avg >= 1.45F,
			String.format(Locale.ROOT, "x%.2f on average, up to x%.2f", eyes.avg, eyes.max));
		this.report.check("other player's mouth opens wide", mouth.max >= 3.2F,
			String.format(Locale.ROOT, "up to %.2f px (idle %.2f px)", mouth.max, idle.layout.mouthHeight));
		this.report.check("other player's face never clips", gap.min >= 0.15F, String.format(Locale.ROOT, "smallest eye-mouth gap %.2f px", gap.min));
		this.waitForTalkEnd(BOB, 120);
		this.ctx.waitTicks(30);
	}

	private void watchBobScream(TestDedicatedServerContext server, GameTestCompat.Connection connection) {
		this.report.section("Watching another player scream");
		Sample idle = this.sample(BOB);
		server.runOnServer(s -> s.getPlayerList().broadcastSystemMessage(Component.literal("<GooglyBob> AAAAAAAHHHHHHH HELP ME"), false));
		connection.waitForClientboundPackets();
		this.ctx.waitTicks(14);
		Sample scream = this.sample(BOB);
		this.report.check("other player screams from chat", scream.mood == Expression.SCREAMING && scream.eyeRatio(idle) >= 1.8F && scream.layout.mouthHeight >= 4.0F,
			String.format(Locale.ROOT, "mood %s, eyes x%.2f, mouth %.2f x %.2f px", scream.mood, scream.eyeRatio(idle), scream.layout.mouthHeight, scream.layout.mouthWidth));
		this.report.screenshot(this.ctx, "mp_other_player_screaming", "The other player screaming");
		this.waitForTalkEnd(BOB, 80);
		this.ctx.waitTicks(40);
	}

	/** Feeds microphone loudness through the same path Simple Voice Chat uses (VoiceActivity -> VoiceLipSync). */
	private void watchBobVoice() {
		this.report.section("Talking with Simple Voice Chat (loudness path)");
		this.ctx.runOnClient(mc -> VoiceActivity.markPluginActive());
		Sample idle = this.sample(BOB);
		List<Sample> speech = new ArrayList<>();
		float loudMouth = 0.0F;
		float quietMouth = 0.0F;
		int loudCount = 0;
		int quietCount = 0;
		for (int i = 0; i < 40; i++) {
			// Speech that gets louder and quieter, like a real voice.
			float level = i % 8 < 4 ? 0.75F : 0.3F;
			short[] samples = tone(level);
			this.ctx.runOnClient(mc -> VoiceActivity.report(BOB, samples));
			this.ctx.waitTick();
			Sample s = this.sample(BOB);
			speech.add(s);
			if (i >= 8) {
				if (i % 8 == 3) {
					loudMouth += s.layout.mouthHeight;
					loudCount++;
				} else if (i % 8 == 7) {
					quietMouth += s.layout.mouthHeight;
					quietCount++;
				}
			}
			if (i == 19) {
				this.report.screenshot(this.ctx, "mp_voice_talking", "The other player talking on voice chat");
			}
		}
		loudMouth /= Math.max(1, loudCount);
		quietMouth /= Math.max(1, quietCount);
		Stats eyes = Stats.of(speech.subList(12, speech.size()), x -> x.eyeRatio(idle));
		boolean talkingFace = speech.getLast().mood == Expression.TALKING && speech.getLast().pose.talking;
		this.report.check("voice makes the other player talk", talkingFace, "mood " + speech.getLast().mood);
		this.report.check("eyes swell while speaking", eyes.avg >= 1.4F, String.format(Locale.ROOT, "x%.2f", eyes.avg));
		this.report.check("mouth follows the voice volume", loudMouth >= 2.4F && loudMouth > quietMouth * 1.4F,
			String.format(Locale.ROOT, "loud: %.2f px, quiet: %.2f px", loudMouth, quietMouth));

		int screamTick = -1;
		Sample yell = null;
		for (int i = 0; i < 26; i++) {
			short[] samples = tone(1.0F);
			this.ctx.runOnClient(mc -> VoiceActivity.report(BOB, samples));
			this.ctx.waitTick();
			yell = this.sample(BOB);
			if (screamTick < 0 && yell.mood == Expression.SCREAMING) {
				screamTick = i;
			}
		}
		this.report.check("yelling into the microphone turns into a scream", screamTick >= 0 && screamTick <= 14 && yell.mood == Expression.SCREAMING,
			"screaming after " + screamTick + " ticks of yelling");
		this.report.check("voice scream has huge eyes and mouth", yell.eyeRatio(idle) >= 1.8F && yell.layout.mouthHeight >= 4.0F,
			String.format(Locale.ROOT, "eyes x%.2f, mouth %.2f px", yell.eyeRatio(idle), yell.layout.mouthHeight));
		this.report.screenshot(this.ctx, "mp_voice_scream", "The other player yelling on voice chat: screaming face");
		this.ctx.waitTicks(50);
		Sample quiet = this.sample(BOB);
		this.report.check("silence returns to the normal face", quiet.mood == Expression.NEUTRAL && quiet.eyeRatio(idle) < 1.08F && quiet.pose.mouthOpen < 0.12F,
			String.format(Locale.ROOT, "mood %s, eyes x%.2f, mouth %.2f", quiet.mood, quiet.eyeRatio(idle), quiet.pose.mouthOpen));
		this.ctx.runOnClient(mc -> VoiceActivity.clear());
	}

	/** 20 ms of 48 kHz voice-like audio at a 0..1 loudness (the inverse of VoiceActivity.loudness). */
	private static short[] tone(float level) {
		double rms = Math.pow(10.0, (-50.0 + 38.0 * level) / 20.0);
		double amplitude = Math.min(32000.0, rms * Math.sqrt(2.0) * 32768.0);
		short[] samples = new short[960];
		for (int i = 0; i < samples.length; i++) {
			samples[i] = (short) Math.round(amplitude * Math.sin(i * 2.0 * Math.PI * 220.0 / 48000.0));
		}
		return samples;
	}

	private void performance(TestDedicatedServerContext server, GameTestCompat.Connection connection) {
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
		this.look(0.0F, 5.0F);
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

		this.look(180.0F, 0.0F);
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

	/** Turns the player to a view rotation (what the newer game test API's {@code lookAt} does), on every version. */
	private void look(float yaw, float pitch) {
		this.ctx.runOnClient(mc -> {
			mc.player.setYRot(yaw);
			mc.player.setXRot(pitch);
		});
	}

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

	/** One measured frame of a face: the animation pose and where the renderer puts every feature. */
	private record Sample(FacePose pose, FaceMeshBuilder.FaceLayout layout, Expression mood) {
		/** Eye size relative to the same eye in another sample (averaged over both eyes). */
		float eyeRatio(Sample base) {
			return 0.5F * (this.pose.eyeScale[0] / base.pose.eyeScale[0] + this.pose.eyeScale[1] / base.pose.eyeScale[1]);
		}
	}

	private record Stats(float min, float max, float avg) {
		static Stats of(List<Sample> samples, Function<Sample, Float> metric) {
			float min = Float.POSITIVE_INFINITY;
			float max = Float.NEGATIVE_INFINITY;
			float sum = 0.0F;
			for (Sample sample : samples) {
				float value = metric.apply(sample);
				min = Math.min(min, value);
				max = Math.max(max, value);
				sum += value;
			}
			return new Stats(min, max, samples.isEmpty() ? 0.0F : sum / samples.size());
		}
	}

	private record TalkMeasure(float eyes, float mouth, float sway, int settleTicks) {
	}

	/** Measures a player's face exactly as the renderer would draw it this tick. */
	private Sample sample(UUID player) {
		return this.ctx.computeOnClient(mc -> {
			Player p = mc.level.getPlayerByUUID(player);
			FaceRenderData data = p instanceof AbstractClientPlayer clientPlayer ? extractOnClient(mc, clientPlayer) : null;
			if (data == null) {
				throw new AssertionError("no face for " + player);
			}
			FaceAnchor anchor = FaceAnchor.PLAYER;
			return new Sample(data.pose, FaceMeshBuilder.measure(data, anchor), FaceAnimationManager.INSTANCE.stateFor(player).activeMood());
		});
	}

	private static float average(float[] values, int from, int to) {
		float sum = 0.0F;
		for (int i = from; i < to; i++) {
			sum += values[i];
		}
		return sum / (to - from);
	}

	/** Ticks after {@code start} until {@code condition} first holds (or the array length). */
	private static int ticksUntil(float[] values, int start, java.util.function.DoublePredicate condition) {
		for (int i = start; i < values.length; i++) {
			if (condition.test(values[i])) {
				return i - start;
			}
		}
		return values.length - start;
	}

	private void waitForTalkEnd(UUID player, int maxTicks) {
		for (int i = 0; i < maxTicks; i++) {
			int left = this.ctx.computeOnClient(mc -> FaceAnimationManager.INSTANCE.stateFor(player).talkTicksLeft());
			if (left <= 0) {
				return;
			}
			this.ctx.waitTick();
		}
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
