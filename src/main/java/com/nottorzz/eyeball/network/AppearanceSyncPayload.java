package com.nottorzz.eyeball.network;

import com.nottorzz.eyeball.EyeBallMod;
import io.netty.buffer.ByteBuf;
import java.util.List;
import java.util.UUID;
import net.minecraft.core.UUIDUtil;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;

/**
 * Server to client: the server-side looks of players (self-chosen looks merged with looks forced
 * by an operator through {@code /googlygoobers}).
 *
 * @param replaceAll true for a full snapshot (sent on join), false for a delta
 * @param entries    per-player {@link com.nottorzz.eyeball.Appearance} flags; flags of 0 clear a player
 */
public record AppearanceSyncPayload(boolean replaceAll, List<Entry> entries) implements CustomPacketPayload {
	public static final int MAX_ENTRIES = 8192;
	public static final Type<AppearanceSyncPayload> TYPE = new Type<>(EyeBallMod.id("appearance_sync"));
	public static final StreamCodec<ByteBuf, AppearanceSyncPayload> CODEC = StreamCodec.composite(
		ByteBufCodecs.BOOL, AppearanceSyncPayload::replaceAll,
		Entry.CODEC.apply(ByteBufCodecs.list(MAX_ENTRIES)), AppearanceSyncPayload::entries,
		AppearanceSyncPayload::new
	);

	public record Entry(UUID player, byte flags) {
		public static final StreamCodec<ByteBuf, Entry> CODEC = StreamCodec.composite(
			UUIDUtil.STREAM_CODEC, Entry::player,
			ByteBufCodecs.BYTE, Entry::flags,
			Entry::new
		);
	}

	@Override
	public Type<? extends CustomPacketPayload> type() {
		return TYPE;
	}
}
