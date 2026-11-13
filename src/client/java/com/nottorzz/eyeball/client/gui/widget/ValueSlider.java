package com.nottorzz.eyeball.client.gui.widget;

import com.nottorzz.eyeball.client.compat.CompatSlider;
import com.nottorzz.eyeball.client.compat.Gfx;
import java.util.function.Consumer;
import java.util.function.DoubleFunction;
import java.util.function.DoubleSupplier;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.components.Tooltip;
import net.minecraft.network.chat.Component;
import org.jspecify.annotations.Nullable;

/**
 * A labelled slider with a coloured fill and a value read-out ("Eye Size   1.25x").
 * Changes apply while dragging. Arrow keys work when focused.
 */
public final class ValueSlider extends CompatSlider {
	private final Component label;
	private final double min;
	private final double max;
	private final double step;
	private final DoubleSupplier getter;
	private final Consumer<Double> setter;
	private final DoubleFunction<String> formatter;

	public ValueSlider(int x, int y, int width, int height, Component label, double min, double max, double step,
					   DoubleSupplier getter, Consumer<Double> setter, DoubleFunction<String> formatter, @Nullable Component tooltip) {
		super(x, y, width, height, label, (getter.getAsDouble() - min) / (max - min));
		this.label = label;
		this.min = min;
		this.max = max;
		this.step = step;
		this.getter = getter;
		this.setter = setter;
		this.formatter = formatter;
		if (tooltip != null) {
			this.setTooltip(Tooltip.create(tooltip));
		}
		this.updateMessage();
	}

	/** Re-reads the value (after "Reset to Defaults"). */
	public void refresh() {
		this.value = Math.clamp((this.getter.getAsDouble() - this.min) / (this.max - this.min), 0.0, 1.0);
		this.updateMessage();
	}

	/** Moves the slider to a value (as if dragged there) and applies it. */
	public void setActualValue(double actual) {
		this.value = Math.clamp((actual - this.min) / (this.max - this.min), 0.0, 1.0);
		this.applyValue();
		this.updateMessage();
	}

	private double actualValue() {
		double raw = this.min + this.value * (this.max - this.min);
		return Math.clamp(Math.round(raw / this.step) * this.step, this.min, this.max);
	}

	@Override
	protected void updateMessage() {
		this.setMessage(Component.empty().append(this.label).append(": ").append(this.formatter.apply(this.actualValue())));
	}

	@Override
	protected void applyValue() {
		this.setter.accept(this.actualValue());
	}

	@Override
	protected void drawWidget(Gfx g, int mouseX, int mouseY, float a) {
		int x = this.getX();
		int y = this.getY();
		boolean hover = this.isHoveredOrFocused();
		if (hover) {
			GuiDraw.roundedRect(g, x, y, this.width, this.height, 3, GuiDraw.ROW_HOVER);
		}
		var font = Minecraft.getInstance().font;
		g.text(font, this.label, x + 6, y + 2, GuiDraw.TEXT, true);
		String valueText = this.formatter.apply(this.actualValue());
		g.text(font, valueText, x + this.width - 6 - font.width(valueText), y + 2, GuiDraw.ACCENT, true);
		int trackX = x + 6;
		int trackW = this.width - 12;
		int trackY = y + this.height - 6;
		GuiDraw.roundedRect(g, trackX, trackY, trackW, 3, 1, 0xFF3A3E48);
		int fill = (int) Math.round(trackW * this.value);
		if (fill > 0) {
			GuiDraw.roundedRect(g, trackX, trackY, fill, 3, 1, hover ? 0xFFFFD36E : GuiDraw.ACCENT);
		}
		int knobX = trackX + fill - 3;
		GuiDraw.roundedRect(g, knobX, trackY - 2, 7, 7, 3, 0xFFFFFFFF);
	}
}
