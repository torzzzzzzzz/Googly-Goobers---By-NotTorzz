package com.nottorzz.eyeball.client.gui.widget;

import com.nottorzz.eyeball.client.gui.PreviewController;
import java.util.function.Consumer;
import java.util.function.Supplier;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.AbstractButton;
import net.minecraft.client.gui.narration.NarrationElementOutput;
import net.minecraft.client.input.InputWithModifiers;

/** A pill button that selects what the preview shows; the selected one is highlighted. */
public final class PreviewModeButton extends AbstractButton {
	private final PreviewController.Mode mode;
	private final Supplier<PreviewController.Mode> current;
	private final Consumer<PreviewController.Mode> select;

	public PreviewModeButton(int x, int y, int width, int height, PreviewController.Mode mode,
							 Supplier<PreviewController.Mode> current, Consumer<PreviewController.Mode> select) {
		super(x, y, width, height, mode.label());
		this.mode = mode;
		this.current = current;
		this.select = select;
	}

	@Override
	public void onPress(InputWithModifiers input) {
		this.select.accept(this.mode);
	}

	@Override
	protected void extractContents(GuiGraphicsExtractor g, int mouseX, int mouseY, float a) {
		boolean selected = this.current.get() == this.mode;
		boolean hover = this.isHoveredOrFocused();
		int background = selected ? GuiDraw.ACCENT : hover ? 0xFF3A3F4B : 0xFF2A2D36;
		int border = selected ? GuiDraw.ACCENT_DARK : hover ? 0xFF5A6070 : 0xFF3A3E48;
		GuiDraw.roundedRect(g, this.getX(), this.getY(), this.getWidth(), this.getHeight(), 4, border);
		GuiDraw.roundedRect(g, this.getX() + 1, this.getY() + 1, this.getWidth() - 2, this.getHeight() - 2, 3, background);
		var font = Minecraft.getInstance().font;
		String text = this.getMessage().getString();
		int color = selected ? 0xFF1C1408 : GuiDraw.TEXT;
		int available = this.getWidth() - 6;
		int textWidth = font.width(text);
		// Shrink long labels to fit instead of cutting them off.
		float scale = textWidth > available ? Math.max(0.55F, (float) available / textWidth) : 1.0F;
		g.pose().pushMatrix();
		g.pose().translate(this.getX() + this.getWidth() / 2.0F, this.getY() + this.getHeight() / 2.0F);
		g.pose().scale(scale, scale);
		g.centeredText(font, text, 0, -4, color);
		g.pose().popMatrix();
	}

	@Override
	protected void updateWidgetNarration(NarrationElementOutput output) {
		this.defaultButtonNarrationText(output);
	}
}
