package com.nottorzz.eyeball;

/**
 * Bit flags describing which cartoon effects a player wears. Shared by the client and the
 * server so they agree on the wire format.
 * <p>
 * Bits 1 and 3 belonged to an effect that was removed before the first public release. They are
 * left unused (and ignored when received) so the wire format of the remaining bits never changes.
 */
public final class Appearance {
	public static final int NONE = 0;
	public static final int GOOGLY = 1;
	/** Sync-only bit: the googly flag was forced by an operator (so it also applies to that player's own view). */
	public static final int FORCED_GOOGLY = 1 << 2;
	public static final int LOOK_MASK = GOOGLY;
	/** Every bit that means something on the wire. */
	public static final int SYNC_MASK = GOOGLY | FORCED_GOOGLY;

	private Appearance() {
	}

	public static boolean googly(int flags) {
		return (flags & GOOGLY) != 0;
	}

	public static int of(boolean googly) {
		return googly ? GOOGLY : NONE;
	}

	public static boolean forcedGoogly(int flags) {
		return (flags & FORCED_GOOGLY) != 0;
	}

	public static String describe(int flags) {
		return googly(flags) ? "googly eyes" : "normal";
	}
}
