package com.nottorzz.eyeball.client.gui;

import com.nottorzz.eyeball.EyeBallMod;
import com.nottorzz.eyeball.client.config.ConfigManager;
import com.nottorzz.eyeball.client.config.EyeBallConfig;
import com.nottorzz.eyeball.client.gui.widget.GuiDraw;
import com.nottorzz.eyeball.client.gui.widget.PreviewModeButton;
import com.nottorzz.eyeball.client.gui.widget.PreviewPanel;
import com.nottorzz.eyeball.client.gui.widget.SettingsList;
import com.nottorzz.eyeball.client.gui.widget.ToggleSwitch;
import com.nottorzz.eyeball.client.gui.widget.ValueSlider;
import com.nottorzz.eyeball.client.target.SyncedLooks;
import com.nottorzz.eyeball.client.voice.VoiceLipSync;
import java.util.Locale;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;
import java.util.function.DoubleConsumer;
import java.util.function.DoubleFunction;
import java.util.function.DoubleSupplier;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.AbstractWidget;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.network.chat.CommonComponents;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.util.Mth;
import net.minecraft.util.Util;
import org.jspecify.annotations.Nullable;

/**
 * The EyeBall settings menu: grouped ON/OFF switches and sliders on the left, a live, rotatable
 * character preview with preview buttons on the right, and Reset / Save / Done at the bottom.
 * <p>
 * Every change applies immediately (the renderer reads the settings every frame). Settings are
 * written to disk by "Save Settings", by "Done" and when the menu is closed with Escape.
 */
public class EyeBallConfigScreen extends Screen {
	private static final Identifier ICON = EyeBallMod.id("icon.png");
	private static final int MARGIN = 8;
	private static final int HEADER = 32;
	private static final int FOOTER = 30;

	private final @Nullable Screen parent;
	private final PreviewController preview = new PreviewController();
	private @Nullable SettingsList list;
	private @Nullable PreviewPanel previewPanel;
	private @Nullable Button saveButton;
	private long savedAt;

	public EyeBallConfigScreen(@Nullable Screen parent) {
		super(Component.translatable("eyeball.menu.title"));
		this.parent = parent;
	}

	@Override
	protected void init() {
		EyeBallConfig config = ConfigManager.get();
		int bodyTop = HEADER;
		int bodyBottom = this.height - FOOTER;
		int listWidth = Mth.clamp((int) (this.width * 0.56F), 220, 340);
		int previewWidth = this.width - listWidth - MARGIN * 3;
		boolean showPreview = previewWidth >= 120;
		if (!showPreview) {
			listWidth = this.width - MARGIN * 2;
		}

		// Keep the scroll position when the window is resized.
		double scroll = this.list != null ? this.list.scrollAmount() : 0.0;
		this.list = new SettingsList(this.minecraft, listWidth, bodyBottom - bodyTop - 4, bodyTop + 2);
		this.list.setX(MARGIN);
		this.buildSettings(config);
		this.addRenderableWidget(this.list);
		if (scroll > 0.0) {
			this.list.setScrollAmount(scroll);
		}

		this.previewPanel = null;
		if (showPreview) {
			int px = MARGIN * 2 + listWidth;
			int buttonHeight = 16;
			int gap = 3;
			PreviewController.Mode[] modes = PreviewController.Mode.values();
			int rows = (modes.length + 2) / 3;
			int gridHeight = buttonHeight * rows + gap * (rows - 1);
			int panelHeight = bodyBottom - bodyTop - gridHeight - 6;
			this.previewPanel = this.addRenderableWidget(new PreviewPanel(px, bodyTop, previewWidth, panelHeight, this.preview));
			int buttonWidth = (previewWidth - gap * 2) / 3;
			for (int i = 0; i < modes.length; i++) {
				int bx = px + (i % 3) * (buttonWidth + gap);
				int by = bodyTop + panelHeight + 6 + (i / 3) * (buttonHeight + gap);
				this.addRenderableWidget(new PreviewModeButton(bx, by, buttonWidth, buttonHeight, modes[i],
					this.preview::mode, this.preview::setMode));
			}
		}

		int buttonWidth = Math.min(110, (this.width - MARGIN * 4) / 3);
		int total = buttonWidth * 3 + MARGIN * 2;
		int fx = (this.width - total) / 2;
		int fy = this.height - FOOTER + 5;
		this.addRenderableWidget(Button.builder(Component.translatable("eyeball.menu.reset"), button -> this.resetToDefaults())
			.bounds(fx, fy, buttonWidth, 20).build());
		this.saveButton = this.addRenderableWidget(Button.builder(Component.translatable("eyeball.menu.save"), button -> this.save())
			.bounds(fx + buttonWidth + MARGIN, fy, buttonWidth, 20).build());
		this.addRenderableWidget(Button.builder(CommonComponents.GUI_DONE, button -> this.onClose())
			.bounds(fx + (buttonWidth + MARGIN) * 2, fy, buttonWidth, 20).build());
	}

	private void buildSettings(EyeBallConfig c) {
		SettingsList l = this.list;
		l.addSection(Component.translatable("eyeball.menu.section.modes"));
		l.addWidget(this.toggle("googly_eyes", () -> c.googlyEyes, v -> c.googlyEyes = v));
		l.addWidget(this.toggle("elmo", () -> c.elmo, v -> c.elmo = v));

		l.addSection(Component.translatable("eyeball.menu.section.animations"));
		l.addWidget(this.toggle("talking", () -> c.talkingAnimations, v -> c.talkingAnimations = v));
		l.addWidget(this.toggle("eyebrows", () -> c.eyebrows, v -> c.eyebrows = v));
		l.addWidget(this.toggle("eyebrow_animations", () -> c.eyebrowAnimations, v -> c.eyebrowAnimations = v));
		l.addWidget(this.toggle("eye_movement", () -> c.eyeMovement, v -> c.eyeMovement = v));
		l.addWidget(this.toggle("blinking", () -> c.blinking, v -> c.blinking = v));
		ToggleSwitch voice = l.addWidget(this.toggle("voice", () -> c.voiceLipSync, v -> c.voiceLipSync = v));
		if (!VoiceLipSync.isAvailable()) {
			l.addInfo(() -> Component.translatable("eyeball.menu.voice.missing"), () -> GuiDraw.TEXT_DIM);
		}
		voice.active = VoiceLipSync.isAvailable();

		l.addSection(Component.translatable("eyeball.menu.section.hit_reactions"));
		l.addWidget(this.toggle("hit_reactions", () -> c.hitReactions, v -> c.hitReactions = v));
		l.addWidget(this.toggle("spiral_eyes", () -> c.spiralEyes, v -> c.spiralEyes = v));
		l.addWidget(this.toggle("head_wobble", () -> c.headWobble, v -> c.headWobble = v));
		l.addWidget(this.toggle("cartoon_stars", () -> c.cartoonStars, v -> c.cartoonStars = v));
		l.addWidget(this.slider("spiral_speed", EyeBallConfig.SPIRAL_SPEED_MIN, EyeBallConfig.SPIRAL_SPEED_MAX, 0.05,
			() -> c.spiralSpeed, v -> c.spiralSpeed = (float) v, v -> format("%.2f rot/s", v)));
		l.addWidget(this.slider("reaction_duration", EyeBallConfig.REACTION_DURATION_MIN, EyeBallConfig.REACTION_DURATION_MAX, 0.1,
			() -> c.reactionDuration, v -> c.reactionDuration = (float) v, v -> format("%.1f s", v)));
		l.addWidget(this.slider("reaction_intensity", EyeBallConfig.REACTION_INTENSITY_MIN, EyeBallConfig.REACTION_INTENSITY_MAX, 0.05,
			() -> c.reactionIntensity, v -> c.reactionIntensity = (float) v, EyeBallConfigScreen::times));

		l.addSection(Component.translatable("eyeball.menu.section.appearance"));
		l.addWidget(this.slider("eye_size", EyeBallConfig.EYE_SIZE_MIN, EyeBallConfig.EYE_SIZE_MAX, 0.05,
			() -> c.eyeSize, v -> c.eyeSize = (float) v, EyeBallConfigScreen::times));
		l.addWidget(this.slider("pupil_size", EyeBallConfig.PUPIL_SIZE_MIN, EyeBallConfig.PUPIL_SIZE_MAX, 0.05,
			() -> c.pupilSize, v -> c.pupilSize = (float) v, EyeBallConfigScreen::times));
		l.addWidget(this.slider("mouth_size", EyeBallConfig.MOUTH_SIZE_MIN, EyeBallConfig.MOUTH_SIZE_MAX, 0.05,
			() -> c.mouthSize, v -> c.mouthSize = (float) v, EyeBallConfigScreen::times));
		l.addWidget(this.slider("eyebrow_size", EyeBallConfig.BROW_SIZE_MIN, EyeBallConfig.BROW_SIZE_MAX, 0.05,
			() -> c.eyebrowSize, v -> c.eyebrowSize = (float) v, EyeBallConfigScreen::times));
		l.addWidget(this.slider("eye_spacing", EyeBallConfig.EYE_SPACING_MIN, EyeBallConfig.EYE_SPACING_MAX, 0.05,
			() -> c.eyeSpacing, v -> c.eyeSpacing = (float) v, EyeBallConfigScreen::times));
		l.addWidget(this.slider("character_size", EyeBallConfig.CHARACTER_SIZE_MIN, EyeBallConfig.CHARACTER_SIZE_MAX, 0.05,
			() -> c.characterSize, v -> c.characterSize = (float) v, EyeBallConfigScreen::times));

		l.addSection(Component.translatable("eyeball.menu.section.talking_style"));
		l.addWidget(this.slider("eye_enlargement", EyeBallConfig.EYE_ENLARGEMENT_MIN, EyeBallConfig.EYE_ENLARGEMENT_MAX, 0.05,
			() -> c.eyeEnlargement, v -> c.eyeEnlargement = (float) v, EyeBallConfigScreen::times));
		l.addWidget(this.slider("mouth_opening", EyeBallConfig.MOUTH_OPENING_MIN, EyeBallConfig.MOUTH_OPENING_MAX, 0.05,
			() -> c.mouthOpening, v -> c.mouthOpening = (float) v, EyeBallConfigScreen::times));
		l.addWidget(this.slider("animation_speed", EyeBallConfig.ANIM_SPEED_MIN, EyeBallConfig.ANIM_SPEED_MAX, 0.05,
			() -> c.animationSpeed, v -> c.animationSpeed = (float) v, EyeBallConfigScreen::times));
		l.addWidget(this.slider("exaggeration", EyeBallConfig.EXAGGERATION_MIN, EyeBallConfig.EXAGGERATION_MAX, 0.05,
			() -> c.exaggeration, v -> c.exaggeration = (float) v, EyeBallConfigScreen::times));
		l.addWidget(this.slider("expression_intensity", EyeBallConfig.EXPRESSION_INTENSITY_MIN, EyeBallConfig.EXPRESSION_INTENSITY_MAX, 0.05,
			() -> c.expressionIntensity, v -> c.expressionIntensity = (float) v, EyeBallConfigScreen::times));

		l.addSection(Component.translatable("eyeball.menu.section.targets"));
		l.addColumnHeader(Component.translatable("eyeball.menu.column.googly"), Component.translatable("eyeball.menu.column.elmo"));
		l.addPair(Component.translatable("eyeball.option.apply_to_myself"),
			this.cell("apply_to_myself", "eyeball.menu.column.googly", () -> c.selfGoogly, v -> c.selfGoogly = v),
			this.cell("apply_to_myself", "eyeball.menu.column.elmo", () -> c.selfElmo, v -> c.selfElmo = v));
		l.addPair(Component.translatable("eyeball.option.apply_to_everyone"),
			this.cell("apply_to_everyone", "eyeball.menu.column.googly", () -> c.everyoneGoogly, v -> c.everyoneGoogly = v),
			this.cell("apply_to_everyone", "eyeball.menu.column.elmo", () -> c.everyoneElmo, v -> c.everyoneElmo = v));
		l.addWidget(Button.builder(Component.translatable("eyeball.menu.player_selection"),
			button -> this.minecraft.gui.setScreen(new PlayerSelectionScreen(this))).build());

		l.addSection(Component.translatable("eyeball.menu.section.multiplayer"));
		l.addWidget(this.toggle("show_synced", () -> c.showSyncedLooks, v -> c.showSyncedLooks = v));
		l.addWidget(this.toggle("share_look", () -> c.shareMyLook, v -> c.shareMyLook = v));
		l.addInfo(EyeBallConfigScreen::serverStatus,
			() -> this.minecraft.getConnection() != null && SyncedLooks.serverHasMod() ? 0xFF7FE08F : GuiDraw.TEXT_DIM);
	}

	private ToggleSwitch toggle(String key, BooleanSupplier getter, Consumer<Boolean> setter) {
		String base = "eyeball.option." + key;
		Component tooltip = net.minecraft.locale.Language.getInstance().has(base + ".tooltip") ? Component.translatable(base + ".tooltip") : null;
		return new ToggleSwitch(0, 0, 200, 20, Component.translatable(base), getter, value -> {
			setter.accept(value);
			this.changed();
		}, tooltip);
	}

	private ToggleSwitch cell(String rowKey, String columnKey, BooleanSupplier getter, Consumer<Boolean> setter) {
		Component tooltip = Component.translatable("eyeball.option." + rowKey + ".tooltip");
		return new ToggleSwitch(0, 0, 40, 20,
			Component.empty(), getter, value -> {
			setter.accept(value);
			this.changed();
		}, Component.translatable(columnKey).append(" - ").append(tooltip));
	}

	private ValueSlider slider(String key, double min, double max, double step, DoubleSupplier getter, DoubleConsumer setter, DoubleFunction<String> format) {
		String base = "eyeball.option." + key;
		Component tooltip = net.minecraft.locale.Language.getInstance().has(base + ".tooltip") ? Component.translatable(base + ".tooltip") : null;
		return new ValueSlider(0, 0, 200, 20, Component.translatable(base), min, max, step, getter, value -> {
			setter.accept(value);
			this.changed();
		}, format, tooltip);
	}

	private static Component serverStatus() {
		var minecraft = net.minecraft.client.Minecraft.getInstance();
		if (minecraft.getConnection() == null) {
			return Component.translatable("eyeball.menu.server.no_world");
		}
		return Component.translatable(SyncedLooks.serverHasMod() ? "eyeball.menu.server.active" : "eyeball.menu.server.inactive");
	}

	private static String format(String pattern, double value) {
		return String.format(Locale.ROOT, pattern, value);
	}

	private static String times(double value) {
		return String.format(Locale.ROOT, "%.2fx", value);
	}

	private void changed() {
		this.savedAt = 0L;
		ConfigManager.notifyChanged();
	}

	private void save() {
		ConfigManager.save();
		ConfigManager.notifyChanged();
		this.savedAt = Util.getMillis();
	}

	private void resetToDefaults() {
		ConfigManager.resetToDefaults();
		if (this.list != null) {
			for (AbstractWidget widget : this.list.allWidgets()) {
				if (widget instanceof ValueSlider slider) {
					slider.refresh();
				}
			}
		}
		this.savedAt = 0L;
	}

	@Override
	public void tick() {
		this.preview.tick(ConfigManager.get());
		if (this.saveButton != null) {
			boolean flash = this.savedAt != 0L && Util.getMillis() - this.savedAt < 1500L;
			this.saveButton.setMessage(Component.translatable(flash ? "eyeball.menu.saved" : "eyeball.menu.save"));
		}
	}

	@Override
	public void extractRenderState(GuiGraphicsExtractor g, int mouseX, int mouseY, float a) {
		super.extractRenderState(g, mouseX, mouseY, a);
		Component title = this.title.copy().withStyle(style -> style.withBold(true));
		Component subtitle = Component.translatable("eyeball.menu.subtitle");
		int titleWidth = this.font.width(title);
		int x = (this.width - titleWidth - 22) / 2;
		g.blit(RenderPipelines.GUI_TEXTURED, ICON, x, 5, 0.0F, 0.0F, 18, 18, 18, 18);
		g.text(this.font, title, x + 22, 6, GuiDraw.ACCENT, true);
		g.text(this.font, subtitle, x + 22, 17, 0xFFE4E6EC, true);
	}

	@Override
	public void onClose() {
		ConfigManager.save();
		ConfigManager.notifyChanged();
		this.minecraft.gui.setScreen(this.parent);
	}

	/** For tests: the preview controller. */
	public PreviewController previewController() {
		return this.preview;
	}

	public @Nullable PreviewPanel previewPanel() {
		return this.previewPanel;
	}

	public @Nullable SettingsList settingsList() {
		return this.list;
	}
}
