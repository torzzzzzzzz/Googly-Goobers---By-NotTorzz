package com.nottorzz.eyeball.client.compat;

import com.nottorzz.eyeball.client.gui.EyeBallConfigScreen;
import com.terraformersmc.modmenu.api.ConfigScreenFactory;
import com.terraformersmc.modmenu.api.ModMenuApi;

/** Adds the "Configure" button for EyeBall in Mod Menu's mod list (only loaded when Mod Menu is installed). */
public final class ModMenuIntegration implements ModMenuApi {
	@Override
	public ConfigScreenFactory<?> getModConfigScreenFactory() {
		return EyeBallConfigScreen::new;
	}
}
