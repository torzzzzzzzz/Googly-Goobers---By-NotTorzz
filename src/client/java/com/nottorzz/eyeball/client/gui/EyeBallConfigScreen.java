package com.nottorzz.eyeball.client.gui;

import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import org.jspecify.annotations.Nullable;

/** Temporary placeholder, replaced by the full menu. */
public class EyeBallConfigScreen extends Screen {
	private final @Nullable Screen parent;

	public EyeBallConfigScreen(@Nullable Screen parent) {
		super(Component.literal("EyeBall"));
		this.parent = parent;
	}

	@Override
	public void onClose() {
		this.minecraft.gui.setScreen(this.parent);
	}
}
