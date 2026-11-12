package com.nottorzz.eyeball.client.render.elmo;

import com.nottorzz.eyeball.EyeBallMod;
import net.fabricmc.fabric.api.client.rendering.v1.ModelLayerRegistry;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import org.jspecify.annotations.Nullable;

/** Holds the Elmo renderer, rebuilt whenever entity renderers are reloaded (resource packs, F3+T). */
public final class ElmoRenderers {
	private static @Nullable ElmoRenderer renderer;

	private ElmoRenderers() {
	}

	public static void registerModelLayers() {
		ModelLayerRegistry.registerModelLayer(ElmoModel.BASE_LAYER, () -> ElmoModel.createLayer(0.0F));
		for (int i = 0; i < ElmoModel.FUR_LAYERS.length; i++) {
			float dilation = ElmoModel.FUR_DILATION[i];
			ModelLayerRegistry.registerModelLayer(ElmoModel.FUR_LAYERS[i], () -> ElmoModel.createLayer(dilation));
		}
	}

	public static void rebuild(EntityRendererProvider.Context context) {
		try {
			renderer = new ElmoRenderer(context);
		} catch (RuntimeException e) {
			// Never break vanilla rendering because of us: without it players just stay unchanged.
			EyeBallMod.LOGGER.error("Could not create the Elmo renderer; the transformation will be unavailable", e);
			renderer = null;
		}
	}

	public static @Nullable ElmoRenderer get() {
		return renderer;
	}
}
