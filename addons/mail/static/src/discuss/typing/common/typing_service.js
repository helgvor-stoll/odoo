/* @odoo-module */

import { reactive, useState } from "@odoo/owl";

import { browser } from "@web/core/browser/browser";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

export const OTHER_LONG_TYPING = 60000;

export class Typing {
    busService;
    /** @type {import("@mail/core/common/channel_member_service").ChannelMemberService} */
    channelMemberService;
    /** @type {Map<number, Set<number>>} */
    memberIdsByChannelId = new Map();
    /** @type {Map<number, number>} */
    timerByMemberId = new Map();
    /** @type {import("@mail/core/common/store_service").Store} */
    storeService;

    /**
     * @param {Partial<import("services").Services>} services
     */
    constructor(services) {
        this.busService = services.bus_service;
        this.channelMemberService = services["discuss.channel.member"];
        this.storeService = services["mail.store"];
    }

    setup() {
        this.busService.subscribe("discuss.channel.member/typing_status", (payload) => {
            const member = this.channelMemberService.insert(payload);
            if (payload.isTyping) {
                this.addTypingMember(member);
            } else {
                this.removeTypingMember(member);
            }
        });
    }

    /**
     * @param {import("@mail/core/common/channel_member_model").ChannelMember} member
     */
    addTypingMember(member) {
        if (!this.memberIdsByChannelId.has(member.thread.id)) {
            this.memberIdsByChannelId.set(member.thread.id, new Set());
        }
        const memberIds = this.memberIdsByChannelId.get(member.thread.id);
        memberIds.add(member.id);
        browser.clearTimeout(this.timerByMemberId.get(member.id));
        this.timerByMemberId.set(
            member.id,
            browser.setTimeout(() => this.removeTypingMember(member), OTHER_LONG_TYPING)
        );
    }

    /**
     * @param {import("@mail/core/common/thread_model").Thread} channel
     * @returns {import("@mail/core/common/channel_member_model").ChannelMember[]}
     */
    getTypingMembers(channel) {
        return [...(this.memberIdsByChannelId.get(channel.id) ?? new Set())]
            .map((id) => this.channelMemberService.insert({ id }))
            .filter((member) => member.persona !== this.storeService.self);
    }

    /**
     * @param {import("@mail/core/common/thread_model").Thread} channel
     * @returns {boolean}
     */
    hasTypingMembers(channel) {
        return this.getTypingMembers(channel).length > 0;
    }

    /**
     * @param {import("@mail/core/common/channel_member_model").ChannelMember} member
     */
    removeTypingMember(member) {
        const memberIds = this.memberIdsByChannelId.get(member.thread.id);
        if (memberIds) {
            memberIds.delete(member.id);
            if (memberIds.size === 0) {
                this.memberIdsByChannelId.delete(member.thread.id);
            }
        }
        browser.clearTimeout(this.timerByMemberId.get(member.id));
        this.timerByMemberId.delete(member.id);
    }
}

export const discussTypingService = {
    dependencies: ["bus_service", "discuss.channel.member", "mail.store"],
    /**
     * @param {import("@web/env").OdooEnv} env
     * @param {Partial<import("services").Services>} services
     */
    start(env, services) {
        const typing = reactive(new Typing(services));
        typing.setup();
        return typing;
    },
};

registry.category("services").add("discuss.typing", discussTypingService);

export function useTypingService() {
    return useState(useService("discuss.typing"));
}
