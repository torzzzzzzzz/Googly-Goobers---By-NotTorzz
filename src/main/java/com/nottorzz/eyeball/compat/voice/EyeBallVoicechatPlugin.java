package com.nottorzz.eyeball.compat.voice;

import com.nottorzz.eyeball.EyeBallMod;
import de.maxhenkel.voicechat.api.VoicechatApi;
import de.maxhenkel.voicechat.api.VoicechatPlugin;
import de.maxhenkel.voicechat.api.events.ClientReceiveSoundEvent;
import de.maxhenkel.voicechat.api.events.ClientSoundEvent;
import de.maxhenkel.voicechat.api.events.EventRegistration;

/**
 * Simple Voice Chat plugin (entrypoint {@code "voicechat"}). Only instantiated by Simple Voice Chat
 * itself, so EyeBall works fine without it.
 * <p>
 * It listens to decoded voice audio on the client: other players' proximity voice
 * ({@link ClientReceiveSoundEvent.EntitySound}), group voice ({@link ClientReceiveSoundEvent.StaticSound})
 * and your own microphone ({@link ClientSoundEvent}), and records how loud each speaker is so the
 * mouth can open and close with their actual voice.
 */
public final class EyeBallVoicechatPlugin implements VoicechatPlugin {
	@Override
	public String getPluginId() {
		return EyeBallMod.MOD_ID;
	}

	@Override
	public void initialize(VoicechatApi api) {
		VoiceActivity.markPluginActive();
		EyeBallMod.LOGGER.info("Simple Voice Chat detected - voice lip sync enabled");
	}

	@Override
	public void registerEvents(EventRegistration registration) {
		registration.registerEvent(ClientSoundEvent.class,
			event -> VoiceActivity.report(VoiceActivity.LOCAL_MICROPHONE, event.getRawAudio()));
		registration.registerEvent(ClientReceiveSoundEvent.EntitySound.class,
			event -> VoiceActivity.report(event.getEntityId(), event.getRawAudio()));
		registration.registerEvent(ClientReceiveSoundEvent.StaticSound.class,
			event -> VoiceActivity.report(event.getId(), event.getRawAudio()));
	}
}
