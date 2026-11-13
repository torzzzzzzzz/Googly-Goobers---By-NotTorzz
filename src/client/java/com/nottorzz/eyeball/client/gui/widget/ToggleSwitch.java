package com.nottorzz.eyeball.client.gui.widget;

import com.nottorzz.eyeball.client.compat.CompatButton;
import com.nottorzz.eyeball.client.compat.Gfx;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.components.Tooltip;
import net.minecraft.client.gui.narration.NarratedElementType;
import net.minecraft.client.gui.narration.NarrationElementOutput;
import net.minecraft.client.input.InputWithModifiers;
import net.minecraft.network.chat.CommonComponents;
import net.minecraft.network.chat.Component;
import net.minecraft.util.Util;
import org.jspecify.annotations.Nullable;

/**
 * An ON/OFF switch row: label on the left, an animated pill switch on the right. Clicking anywhere
 * on the row (or pressing Enter/Space) flips it, and the change applies immediately.
 * With an empty label it is just the compact switch (used in Player Selection rows).
 */
public final class ToggleSwitch extends CompatButton {
	private static final int TRACK_W = 26;
	private static final int TRACK_H = 12;

	private final BooleanSupplier getter;
	private final Consumer<Boolean> setter;
	private float knob;
	private long lastFrame = -1L;

	public ToggleSwitch(int x, int y, int width, int height, Component label, BooleanSupplier getter, Consumer<Boolean> setter, @Nullable Component tooltip) {
		super(x, y, width, height, label);
		this.getter = getter;
		this.setter = setter;
		this.knob = getter.getAsBoolean() ? 1.0F : 0.0F;
		if (tooltip != null) {
			this.setTooltip(Tooltip.create(tooltip));
		}
	}

	public boolean value() {
		return this.getter.getAsBoolean();
	}

	@Override
	public void onPress(InputWithModifiers input) {
		this.setter.accept(!this.getter.getAsBoolean());
	}

	@Override
	protected void drawContents(Gfx g, int mouseX, int mouseY, float a) {
		boolean on = this.getter.getAsBoolean();
		long now = Util.getMillis();
		float dt = this.lastFrame < 0 ? 1.0F : Math.min(1.0F, (now - this.lastFrame) / 120.0F);
		this.lastFrame = now;
		this.knob += ((on ? 1.0F : 0.0F) - this.knob) * dt;
		boolean hover = this.isHoveredOrFocused() && this.active;
		boolean hasLabel = !this.getMessage().getString().isEmpty();
		int x = this.getX();
		int y = this.getY();
		if (hover && hasLabel) {
			GuiDraw.roundedRect(g, x, y, this.width, this.height, 3, GuiDraw.ROW_HOVER);
		}
		var font = Minecraft.getInstance().font;
		if (hasLabel) {
			int textColor = this.active ? GuiDraw.TEXT : GuiDraw.TEXT_DIM;
			g.text(font, this.getMessage(), x + 6, y + (this.height - 8) / 2, textColor, true);
		}
		int trackX = hasLabel ? x + this.width - TRACK_W - 6 : x + (this.width - TRACK_W) / 2;
		int trackY = y + (this.height - TRACK_H) / 2;
		int offColor = hover ? GuiDraw.OFF_HOVER : GuiDraw.OFF;
		int onColor = hover ? GuiDraw.ON_HOVER : GuiDraw.ON;
		int track = GuiDraw.lerpColor(offColor, onColor, this.knob);
		if (!this.active) {
			track = GuiDraw.lerpColor(track, 0xFF2A2C33, 0.6F);
		}
		GuiDraw.roundedRect(g, trackX, trackY, TRACK_W, TRACK_H, 6, track);
		int knobSize = TRACK_H - 4;
		int knobX = trackX + 2 + Math.round((TRACK_W - knobSize - 4) * this.knob);
		GuiDraw.roundedRect(g, knobX, trackY + 2, knobSize, knobSize, 4, 0xFFFFFFFF);
	}

	@Override
	protected void updateWidgetNarration(NarrationElementOutput output) {
		output.add(NarratedElementType.TITLE, Component.empty().append(this.getMessage()).append(": ")
			.append(this.getter.getAsBoolean() ? CommonComponents.OPTION_ON : CommonComponents.OPTION_OFF));
	}
}
