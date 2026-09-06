/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { BaseText } from "@components/BaseText";
import { Flex } from "@components/Flex";
import { AtIcon, RightArrow, TextIcon } from "@components/Icons";
import { iconsModule } from "@equicordplugins/_core/concatenatedModules";
import { getGuildAcronym, getIntlMessage } from "@utils/discord";
import { getUserAvatarUrl } from "@utils/misc";
import { BasicGuild, Guild, MessageAttachment } from "@vencord/discord-types";
import { findByCodeLazy, findComponentByCodeLazy } from "@webpack";
import { BasicGuildStore, ChannelActionCreators, ChannelStore, DateUtils, GuildStore, IconUtils, Popout, React, RelationshipStore, SelectedGuildStore, SnowflakeUtils, useCallback, useEffect, useMemo, useRef, UserStore, useStateFromStores } from "@webpack/common";
import { ReactNode } from "react";

import { cl, ForwardOptionsContext, ForwardOptionsState } from ".";

type AttachmentType = "IMAGE" | "VIDEO" | "CLIP" | "AUDIO" | "VISUAL_PLACEHOLDER" | "PLAINTEXT_PREVIEW" | "OTHER" | "INVALID";

const TagGroup = findComponentByCodeLazy("disallowEmptySelection:", "onSelectionChange:", "accessibilityHint:");
const ServerProfileComponent = findComponentByCodeLazy("{guildProfile:", "GUILD_PROFILE");
const getAttachmentType = findByCodeLazy('"PLAINTEXT_PREVIEW":"OTHER"');
const formatChannelName = findByCodeLazy("#{intl::NO_ACCESS}", "isObfuscated()");
const getChannelIcon = findByCodeLazy("textFocused:", "isGameInvitesChannel()");
const navigateTo = findByCodeLazy('getConfig({location:"channel_mention"})');
const fetchBasicGuild = findByCodeLazy('type:"BASIC_GUILD_FETCH_SUCCESS"');

export function GuildName({ guildId }: { guildId: string; }) {
    const currentGuildId = useStateFromStores([SelectedGuildStore], () => SelectedGuildStore.getGuildId(), []);
    const guild: Guild | BasicGuild | undefined = useStateFromStores(
        [GuildStore, BasicGuildStore],
        () => GuildStore.getGuild(guildId) ?? BasicGuildStore.getGuild(guildId),
        [guildId]
    );

    const icon = useMemo(() => {
        if (!guild) return null;

        return guild.icon ? (
            <img
                src={IconUtils.getGuildIconURL({ ...guild, canAnimate: true, size: 16 })}
                alt={`Server icon for ${guild.name}`}
                className={cl("guild-icon")}
            />
        ) : (
            <div className={cl("guild-acronym")}>{getGuildAcronym(guild)}</div>
        );
    }, [guild]);

    const guildDivRef = useRef(null);

    useEffect(() => void fetchBasicGuild(guildId), [guildId]);

    return (
        currentGuildId !== guildId && (
            <Popout
                position="top"
                renderPopout={() => <ServerProfileComponent guildId={guildId} />}
                targetElementRef={guildDivRef}
            >
                {popoutProps => (
                    <div ref={guildDivRef} className={cl("footer-element")} {...popoutProps}>
                        {icon}
                        <BaseText size="sm" weight="medium" className={cl("footer-text")}>
                            {guild ? guild.name : "View server"}
                        </BaseText>
                        <RightArrow width={12} height={12} fill="currentColor" />
                    </div>
                )}
            </Popout>
        )
    );
}

export function ChannelName({ guildId, channelId, messageId }: { guildId?: string; channelId: string; messageId: string; }) {
    const channel = useStateFromStores([ChannelStore], () => ChannelStore.getChannel(channelId), [channelId]);
    const name: ReactNode = useStateFromStores(
        [UserStore, RelationshipStore],
        () =>
            channel ? (
                formatChannelName(channel, UserStore, RelationshipStore, false, false)
            ) : (
                <i>{guildId ? getIntlMessage("UNKNOWN_CHANNEL").toLowerCase() : getIntlMessage("UNKNOWN_USER")}</i>
            ),
        [channel, guildId]
    );

    const icon = useMemo(() => {
        if (channel?.isDM()) {
            const [user] = channel.recipients.map(UserStore.getUser).filter(Boolean);
            if (user)
                return (
                    <img
                        src={getUserAvatarUrl(user, guildId, true, 16)}
                        alt={`DM icon for ${name}`}
                        className={cl("user-icon")}
                    />
                );
        }

        if (channel?.isGroupDM()) {
            return (
                <img
                    src={IconUtils.getChannelIconURL({
                        ...channel,
                        applicationId: channel.getApplicationId(),
                        size: 16
                    })}
                    alt={`Group DM icon for ${name}`}
                    className={cl("user-icon")}
                />
            );
        }

        const Icon = (channel && getChannelIcon(channel)) ?? (guildId ? TextIcon : AtIcon);
        return <Icon size="xs" color="currentColor" />;
    }, [channel, guildId, name]);

    return (
        <div
            className={cl("footer-element")}
            onClick={() => navigateTo(guildId ?? "@me", channelId, messageId)}
            onMouseEnter={() => ChannelActionCreators.preload(guildId ?? "@me", channelId)}
        >
            {icon}
            <BaseText size="sm" weight="medium" className={cl("footer-text")}>
                {name}
            </BaseText>
            <RightArrow width={12} height={12} fill="currentColor" />
        </div>
    );
}

export function Timestamp({ snowflake }: { snowflake: string; }) {
    const formatted = useMemo(
        () => DateUtils.calendarFormat(new Date(SnowflakeUtils.extractTimestamp(snowflake))),
        [snowflake]
    );

    return (
        <div className={cl("footer-element")} style={{ pointerEvents: "none" }}>
            <BaseText size="sm" weight="medium" className={cl("footer-text")}>
                {formatted}
            </BaseText>
        </div>
    );
}

export function ForwardPicker() {
    const state = React.useContext(ForwardOptionsContext);
    const { message } = state;

    if (!message || message.embeds.length + message.attachments.length === 0) return null;

    return (
        <Flex gap={12} flexDirection="column">
            {message.attachments.length > 0 && <AttachmentPicker {...state} message={message} />}
            {message.embeds.length > 0 && <EmbedPicker {...state} message={message} />}
        </Flex>
    );
}

export function EmbedPicker(props: Required<ForwardOptionsState>) {
    const embeds = useMemo(() => {
        let id = 0;
        return props.message.embeds.map(({ rawTitle, rawDescription, image, images = image ? [image] : [], video }, i) => {
            const current = {
                title: rawTitle?.trim() || rawDescription?.trim() || `Embed ${i + 1}`,
                subEmbeds: [] as { id: number; name: string; isMainEmbed: boolean; }[]
            };

            if (images.length > 0) {
                // The "main" embed is the first embed with the same url (in 99% cases), which is used for displaying embed metadata (title, description, etc).
                // It's only possible to tell it apart in the raw API message source since the client groups all related embeds together.
                current.subEmbeds = images.map((image, si) => ({
                    id: id++,
                    name: `${si === 0 ? "Embed + " : ""}Image ${images.length > 1 ? `${si + 1} ` : ""}(${image!.width} x ${image!.height})`,
                    isMainEmbed: si === 0
                }));
            } else if (video) {
                current.subEmbeds = [{ id: id++, name: "Embed + Video", isMainEmbed: true }];
            } else {
                current.subEmbeds = [{ id: id++, name: "Embed", isMainEmbed: true }];
            }

            return current;
        });
    }, [props.message]);

    return embeds?.map((embed, i) => <SubEmbedPicker {...props} {...embed} key={i} />);
}

interface SubEmbedPickerProps extends Required<ForwardOptionsState> {
    title: string;
    subEmbeds: { id: number; name: string; isMainEmbed: boolean; }[];
}

export function SubEmbedPicker({ title, subEmbeds, opts, setOpts, hasOpts, defaultOpts }: SubEmbedPickerProps) {
    const { EmbedIcon, ImageIcon } = iconsModule;
    const items = useMemo(() => subEmbeds.map(({ id, name, isMainEmbed }) => ({
        id,
        label: name,
        icon: isMainEmbed ? EmbedIcon : ImageIcon,
        isDisabled: !hasOpts,
    })), [subEmbeds, hasOpts]);
    const validItems = useMemo(() => new Set(subEmbeds.map(({ id }) => id)), [subEmbeds]);

    const selected = hasOpts ? opts.onlyEmbedIndices : defaultOpts.onlyEmbedIndices;
    const selectedKeys = useMemo(() => new Set(selected).intersection(validItems), [selected]);
    const onSelectionChange = useCallback(
        (selection: Set<number> | "all") => setOpts(prev => {
            const other = prev.onlyEmbedIndices?.filter(id => !validItems.has(id)) ?? [];
            return { ...prev, onlyEmbedIndices: [...other, ...(selection === "all" ? validItems : selection)] };
        }), [setOpts, items],
    );

    return <Flex gap={4} flexDirection="column" key={subEmbeds[0].id}>
        <BaseText
            size="sm"
            color="text-subtle"
            className={cl("embed-name")}
            style={{ opacity: !hasOpts ? 0.5 : undefined }}
        >
            {title}
        </BaseText>
        <TagGroup
            label={title}
            selectionMode="multiple"
            layout="inline"
            items={items}
            selectedKeys={selectedKeys}
            onSelectionChange={onSelectionChange}
        />
    </Flex>;
}

export function AttachmentPicker({ message, opts, setOpts, hasOpts, defaultOpts }: Required<ForwardOptionsState>) {
    const items = useMemo(() => message.attachments.map(attachment => ({
        id: attachment.id,
        label: attachment.title ?? attachment.filename,
        icon: props => <AttachmentIcon {...props} attachment={attachment} />,
        isDisabled: !hasOpts,
    })), [message.attachments, hasOpts]);

    const selected = hasOpts ? opts.onlyAttachmentIds : defaultOpts.onlyAttachmentIds;
    const selectedKeys = useMemo(() => new Set(selected), [selected]);
    const onSelectionChange = useCallback(
        (selection: Set<string> | "all") => setOpts(prev =>
            ({ ...prev, onlyAttachmentIds: selection === "all" ? items.map(({ id }) => id) : [...selection] })
        ), [setOpts, items],
    );

    return (
        <TagGroup
            label="Message attachments"
            selectionMode="multiple"
            layout="inline"
            items={items}
            selectedKeys={selectedKeys}
            onSelectionChange={onSelectionChange}
        />
    );
}

const attachmentIcons: Partial<Record<AttachmentType, string>> = {
    IMAGE: "Image",
    VIDEO: "Video",
    CLIP: "Clips",
    AUDIO: "Music",
    PLAINTEXT_PREVIEW: "A"
};

function AttachmentIcon({ attachment, ...props }: { attachment: MessageAttachment; size?: string; color?: string; }) {
    const Icon = useMemo(() => {
        const type = getAttachmentType(attachment, true);
        return iconsModule[(attachmentIcons[type] ?? "ImageFile") + "Icon"];
    }, [attachment]);

    return Icon && <Icon style={{ flexShrink: 0 }} {...props} />;
}
