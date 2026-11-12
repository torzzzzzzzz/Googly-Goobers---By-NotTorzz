package com.nottorzz.eyeball;

/** Kinds of face events relayed between modded clients through the server. */
public enum FaceEventKind {
	/** The player is talking (sent a chat message). */
	TALK,
	/** The player made a face on purpose (keybind / command). */
	EXPRESSION,
	/** A cartoon hit reaction triggered by a command (real damage is detected client-side). */
	REACTION;

	public static FaceEventKind byId(int id) {
		FaceEventKind[] values = values();
		return id >= 0 && id < values.length ? values[id] : TALK;
	}
}
