--
-- PostgreSQL database dump
--

\restrict SGGFfovasOjeN3kmJlIFryjimehbvEfL6qgeObFeNwLcwiFhk7AzpRnnqJvog0x

-- Dumped from database version 16.15
-- Dumped by pg_dump version 16.15

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: drizzle; Type: SCHEMA; Schema: -; Owner: pocketledger_user
--

CREATE SCHEMA drizzle;


ALTER SCHEMA drizzle OWNER TO pocketledger_user;

--
-- Name: access_token_revocation_reason; Type: TYPE; Schema: public; Owner: pocketledger_user
--

CREATE TYPE public.access_token_revocation_reason AS ENUM (
    'user_logout',
    'logout_all',
    'session_revoked',
    'refresh_token_reuse',
    'security_concern',
    'account_suspended',
    'account_closed',
    'role_changed',
    'admin_revoked'
);


ALTER TYPE public.access_token_revocation_reason OWNER TO pocketledger_user;

--
-- Name: audit_action; Type: TYPE; Schema: public; Owner: pocketledger_user
--

CREATE TYPE public.audit_action AS ENUM (
    'user_created',
    'user_updated',
    'user_suspended',
    'user_reactivated',
    'role_changed',
    'wallet_created',
    'deposit_initiated',
    'deposit_completed',
    'transfer_initiated',
    'transfer_completed',
    'transfer_failed',
    'refund_initiated',
    'refund_completed',
    'reversal_created',
    'admin_action'
);


ALTER TYPE public.audit_action OWNER TO pocketledger_user;

--
-- Name: delivery_status; Type: TYPE; Schema: public; Owner: pocketledger_user
--

CREATE TYPE public.delivery_status AS ENUM (
    'pending',
    'processing',
    'delivered',
    'failed',
    'dead_lettered'
);


ALTER TYPE public.delivery_status OWNER TO pocketledger_user;

--
-- Name: email_outbox_status; Type: TYPE; Schema: public; Owner: pocketledger_user
--

CREATE TYPE public.email_outbox_status AS ENUM (
    'pending',
    'processing',
    'sent',
    'failed',
    'cancelled'
);


ALTER TYPE public.email_outbox_status OWNER TO pocketledger_user;

--
-- Name: email_template; Type: TYPE; Schema: public; Owner: pocketledger_user
--

CREATE TYPE public.email_template AS ENUM (
    'registration_otp',
    'login_otp',
    'security_notification'
);


ALTER TYPE public.email_template OWNER TO pocketledger_user;

--
-- Name: inbox_event_status; Type: TYPE; Schema: public; Owner: pocketledger_user
--

CREATE TYPE public.inbox_event_status AS ENUM (
    'received',
    'processing',
    'processed',
    'failed',
    'dead_lettered'
);


ALTER TYPE public.inbox_event_status OWNER TO pocketledger_user;

--
-- Name: login_failure_reason; Type: TYPE; Schema: public; Owner: pocketledger_user
--

CREATE TYPE public.login_failure_reason AS ENUM (
    'invalid_otp',
    'otp_expired',
    'otp_already_used',
    'too_many_attempts',
    'rate_limited',
    'account_unavailable',
    'session_creation_failed'
);


ALTER TYPE public.login_failure_reason OWNER TO pocketledger_user;

--
-- Name: notification_channel; Type: TYPE; Schema: public; Owner: pocketledger_user
--

CREATE TYPE public.notification_channel AS ENUM (
    'in_app',
    'email',
    'push',
    'sms'
);


ALTER TYPE public.notification_channel OWNER TO pocketledger_user;

--
-- Name: notification_status; Type: TYPE; Schema: public; Owner: pocketledger_user
--

CREATE TYPE public.notification_status AS ENUM (
    'unread',
    'read',
    'archived'
);


ALTER TYPE public.notification_status OWNER TO pocketledger_user;

--
-- Name: notification_type; Type: TYPE; Schema: public; Owner: pocketledger_user
--

CREATE TYPE public.notification_type AS ENUM (
    'security_alert',
    'transaction_update',
    'deposit_update',
    'withdrawal_update',
    'system_announcement'
);


ALTER TYPE public.notification_type OWNER TO pocketledger_user;

--
-- Name: otp_purpose; Type: TYPE; Schema: public; Owner: pocketledger_user
--

CREATE TYPE public.otp_purpose AS ENUM (
    'registration',
    'login'
);


ALTER TYPE public.otp_purpose OWNER TO pocketledger_user;

--
-- Name: outbox_event_status; Type: TYPE; Schema: public; Owner: pocketledger_user
--

CREATE TYPE public.outbox_event_status AS ENUM (
    'pending',
    'processing',
    'published',
    'dead_lettered'
);


ALTER TYPE public.outbox_event_status OWNER TO pocketledger_user;

--
-- Name: permission_override_effect; Type: TYPE; Schema: public; Owner: pocketledger_user
--

CREATE TYPE public.permission_override_effect AS ENUM (
    'grant',
    'revoke'
);


ALTER TYPE public.permission_override_effect OWNER TO pocketledger_user;

--
-- Name: security_event_severity; Type: TYPE; Schema: public; Owner: pocketledger_user
--

CREATE TYPE public.security_event_severity AS ENUM (
    'low',
    'medium',
    'high',
    'critical'
);


ALTER TYPE public.security_event_severity OWNER TO pocketledger_user;

--
-- Name: security_event_type; Type: TYPE; Schema: public; Owner: pocketledger_user
--

CREATE TYPE public.security_event_type AS ENUM (
    'otp_requested',
    'otp_verified',
    'otp_verification_failed',
    'registration_completed',
    'login_succeeded',
    'login_failed',
    'session_created',
    'session_revoked',
    'access_token_revoked',
    'refresh_token_rotated',
    'refresh_token_reuse_detected',
    'rate_limit_exceeded',
    'account_suspended',
    'account_reactivated',
    'role_changed',
    'suspicious_activity_detected'
);


ALTER TYPE public.security_event_type OWNER TO pocketledger_user;

--
-- Name: session_revocation_reason; Type: TYPE; Schema: public; Owner: pocketledger_user
--

CREATE TYPE public.session_revocation_reason AS ENUM (
    'user_logout',
    'logout_all',
    'refresh_token_reuse',
    'security_concern',
    'password_changed',
    'account_suspended',
    'admin_revoked',
    'session_expired'
);


ALTER TYPE public.session_revocation_reason OWNER TO pocketledger_user;

--
-- Name: user_role; Type: TYPE; Schema: public; Owner: pocketledger_user
--

CREATE TYPE public.user_role AS ENUM (
    'customer',
    'support',
    'admin'
);


ALTER TYPE public.user_role OWNER TO pocketledger_user;

--
-- Name: user_status; Type: TYPE; Schema: public; Owner: pocketledger_user
--

CREATE TYPE public.user_status AS ENUM (
    'pending_verification',
    'active',
    'inactive',
    'suspended',
    'closed'
);


ALTER TYPE public.user_status OWNER TO pocketledger_user;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: __drizzle_migrations; Type: TABLE; Schema: drizzle; Owner: pocketledger_user
--

CREATE TABLE drizzle.__drizzle_migrations (
    id integer NOT NULL,
    hash text NOT NULL,
    created_at bigint
);


ALTER TABLE drizzle.__drizzle_migrations OWNER TO pocketledger_user;

--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE; Schema: drizzle; Owner: pocketledger_user
--

CREATE SEQUENCE drizzle.__drizzle_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE drizzle.__drizzle_migrations_id_seq OWNER TO pocketledger_user;

--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: drizzle; Owner: pocketledger_user
--

ALTER SEQUENCE drizzle.__drizzle_migrations_id_seq OWNED BY drizzle.__drizzle_migrations.id;


--
-- Name: access_token_revocations; Type: TABLE; Schema: public; Owner: pocketledger_user
--

CREATE TABLE public.access_token_revocations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    jti uuid NOT NULL,
    user_id uuid NOT NULL,
    session_id uuid,
    reason public.access_token_revocation_reason NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone DEFAULT now() NOT NULL,
    user_agent character varying(1000),
    ip_address inet
);


ALTER TABLE public.access_token_revocations OWNER TO pocketledger_user;

--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: pocketledger_user
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_user_id uuid,
    action public.audit_action NOT NULL,
    entity_type character varying(100) NOT NULL,
    entity_id uuid,
    ip_address inet,
    user_agent character varying(1000),
    before jsonb,
    after jsonb,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.audit_logs OWNER TO pocketledger_user;

--
-- Name: email_outbox; Type: TABLE; Schema: public; Owner: pocketledger_user
--

CREATE TABLE public.email_outbox (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    recipient character varying(255) NOT NULL,
    template public.email_template NOT NULL,
    encrypted_payload text NOT NULL,
    encryption_key_version character varying(50) NOT NULL,
    status public.email_outbox_status DEFAULT 'pending'::public.email_outbox_status NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    available_at timestamp with time zone DEFAULT now() NOT NULL,
    sent_at timestamp with time zone,
    last_error character varying(1000),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    max_attempts integer DEFAULT 5 NOT NULL,
    processing_at timestamp with time zone,
    locked_by character varying(255),
    lease_expires_at timestamp with time zone,
    claim_token uuid
);


ALTER TABLE public.email_outbox OWNER TO pocketledger_user;

--
-- Name: inbox_events; Type: TABLE; Schema: public; Owner: pocketledger_user
--

CREATE TABLE public.inbox_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    consumer_name character varying(200) NOT NULL,
    event_id uuid NOT NULL,
    event_type character varying(200) NOT NULL,
    schema_version integer DEFAULT 1 NOT NULL,
    status public.inbox_event_status DEFAULT 'received'::public.inbox_event_status NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 10 NOT NULL,
    available_at timestamp with time zone DEFAULT now() NOT NULL,
    processing_at timestamp with time zone,
    claim_token uuid,
    locked_by character varying(255),
    lease_expires_at timestamp with time zone,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    failure_reason character varying(1000),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    aggregate_type character varying(100) NOT NULL,
    aggregate_id character varying(255) NOT NULL,
    payload jsonb NOT NULL,
    correlation_id uuid,
    occurred_at timestamp with time zone NOT NULL
);


ALTER TABLE public.inbox_events OWNER TO pocketledger_user;

--
-- Name: login_attempts; Type: TABLE; Schema: public; Owner: pocketledger_user
--

CREATE TABLE public.login_attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    email character varying(255),
    success boolean NOT NULL,
    failure_reason public.login_failure_reason,
    ip_address inet,
    user_agent character varying(1000),
    country character varying(100),
    city character varying(100),
    latitude double precision,
    longitude double precision,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.login_attempts OWNER TO pocketledger_user;

--
-- Name: notification_deliveries; Type: TABLE; Schema: public; Owner: pocketledger_user
--

CREATE TABLE public.notification_deliveries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    notification_id uuid NOT NULL,
    channel public.notification_channel NOT NULL,
    status public.delivery_status DEFAULT 'pending'::public.delivery_status NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 5 NOT NULL,
    next_retry_at timestamp with time zone,
    provider_message_id character varying(255),
    failure_reason character varying(1000),
    last_attempt_at timestamp with time zone,
    delivered_at timestamp with time zone,
    dead_lettered_at timestamp with time zone,
    locked_by character varying(255),
    lease_expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.notification_deliveries OWNER TO pocketledger_user;

--
-- Name: notification_preferences; Type: TABLE; Schema: public; Owner: pocketledger_user
--

CREATE TABLE public.notification_preferences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    type public.notification_type NOT NULL,
    channel public.notification_channel NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.notification_preferences OWNER TO pocketledger_user;

--
-- Name: notifications; Type: TABLE; Schema: public; Owner: pocketledger_user
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    type public.notification_type NOT NULL,
    title character varying(200) NOT NULL,
    message text NOT NULL,
    status public.notification_status DEFAULT 'unread'::public.notification_status NOT NULL,
    event_id uuid NOT NULL,
    event_type character varying(150) NOT NULL,
    metadata jsonb,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.notifications OWNER TO pocketledger_user;

--
-- Name: otp_challenges; Type: TABLE; Schema: public; Owner: pocketledger_user
--

CREATE TABLE public.otp_challenges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email character varying(255) NOT NULL,
    purpose public.otp_purpose NOT NULL,
    code_hash character varying(128) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 5 NOT NULL,
    consumed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.otp_challenges OWNER TO pocketledger_user;

--
-- Name: outbox_events; Type: TABLE; Schema: public; Owner: pocketledger_user
--

CREATE TABLE public.outbox_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_type character varying(200) NOT NULL,
    schema_version integer DEFAULT 1 NOT NULL,
    aggregate_type character varying(100) NOT NULL,
    aggregate_id character varying(255) NOT NULL,
    payload jsonb NOT NULL,
    correlation_id uuid,
    status public.outbox_event_status DEFAULT 'pending'::public.outbox_event_status NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 10 NOT NULL,
    available_at timestamp with time zone DEFAULT now() NOT NULL,
    processing_at timestamp with time zone,
    locked_by character varying(255),
    lease_expires_at timestamp with time zone,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    published_at timestamp with time zone,
    last_error character varying(1000),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    aggregate_sequence bigint,
    claim_token uuid
);


ALTER TABLE public.outbox_events OWNER TO pocketledger_user;

--
-- Name: pending_registrations; Type: TABLE; Schema: public; Owner: pocketledger_user
--

CREATE TABLE public.pending_registrations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email character varying(255) NOT NULL,
    email_verified_at timestamp with time zone,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.pending_registrations OWNER TO pocketledger_user;

--
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: pocketledger_user
--

CREATE TABLE public.refresh_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    token_hash character varying(128) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    replaced_by_token_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.refresh_tokens OWNER TO pocketledger_user;

--
-- Name: security_events; Type: TABLE; Schema: public; Owner: pocketledger_user
--

CREATE TABLE public.security_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    type public.security_event_type NOT NULL,
    severity public.security_event_severity DEFAULT 'medium'::public.security_event_severity NOT NULL,
    ip_address inet,
    user_agent character varying(1000),
    country character varying(100),
    city character varying(100),
    metadata jsonb,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.security_events OWNER TO pocketledger_user;

--
-- Name: sessions; Type: TABLE; Schema: public; Owner: pocketledger_user
--

CREATE TABLE public.sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    device_name character varying(255),
    user_agent character varying(1000),
    ip_address inet,
    country character varying(100),
    city character varying(100),
    last_activity_at timestamp with time zone,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    revoke_reason public.session_revocation_reason,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.sessions OWNER TO pocketledger_user;

--
-- Name: user_permission_overrides; Type: TABLE; Schema: public; Owner: pocketledger_user
--

CREATE TABLE public.user_permission_overrides (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    permission character varying(100) NOT NULL,
    effect public.permission_override_effect NOT NULL,
    actor_user_id uuid,
    reason character varying(500),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.user_permission_overrides OWNER TO pocketledger_user;

--
-- Name: users; Type: TABLE; Schema: public; Owner: pocketledger_user
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    first_name character varying(100) NOT NULL,
    last_name character varying(100) NOT NULL,
    middle_name character varying(100),
    username character varying(50),
    phone_number character varying(20),
    email character varying(255) NOT NULL,
    role public.user_role DEFAULT 'customer'::public.user_role NOT NULL,
    status public.user_status DEFAULT 'pending_verification'::public.user_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.users OWNER TO pocketledger_user;

--
-- Name: __drizzle_migrations id; Type: DEFAULT; Schema: drizzle; Owner: pocketledger_user
--

ALTER TABLE ONLY drizzle.__drizzle_migrations ALTER COLUMN id SET DEFAULT nextval('drizzle.__drizzle_migrations_id_seq'::regclass);


--
-- Data for Name: __drizzle_migrations; Type: TABLE DATA; Schema: drizzle; Owner: pocketledger_user
--

COPY drizzle.__drizzle_migrations (id, hash, created_at) FROM stdin;
1	d9166aaca19356850cd765ddbeea49e33a7869488d9d842b8cf65d4bef5edb0b	1792838477517
2	62a3e5d7538f4a39e5564a57dcbf35da43b5a750e71d2d707d2c9e7a3d7e340d	1792842116919
3	cb956d45081e5726b97656c2cb8f2b970f58be398782719018ab1c418cbd122c	1792842294125
4	358e8aec5dd002dd9fb250614806002b3c077f57c7563f22d6fd13125019e161	1792842832369
5	e4bf00cad5ed1cf3e7a66071f2e4261cbd8e3b3afef066019809903c9fb395a6	1792843340005
6	8bdb4ca92327290f8833e8922ee18a821c87bb9ac190f361a56d56cbabb22690	1792843817403
7	d713aa7177a259a5b81304f7f776eb784ecb4e9dd23ac93ef0278111c2c7f22a	1792844250095
8	db6f6d1110134baf92db2b53da9211ba49cf338877dffdb38ed7b7607a2af338	1792845541683
9	0cc9381f39a39e40189885cf4baafb40b2dc46221ba074c1b0442a078e681e77	1792945536100
10	b4b797e4d8e9e6d868937455a85c95300f1f49f0855752613e3e1f4c9aa2348b	1793438805713
11	f91f11e242c5345288afc4625f5f4f0203ccd451205b9ad7b13edd9ae831ccb4	1793530337724
12	88f3df82f27d64150fbabdcd22ebb20592132c935129701bd93ae9cc5035e487	1793684687157
13	9e18e9800f31740cf2753bda98f0dc9c338f042f8345e42a2d09956ea18070b4	1794130899410
14	cafc670e265d7f528ac29e1214e5c860e6a38ca8c2c32d2c9095905104a8782d	1794131645128
15	55a88ed2a54582f7d5431c06eba5c7ec9f3913c008a2485e5d560e9303e64618	1794135314185
16	f891b1c539a9091133de9860cef836b93139236e03ebd3731ce7141e879d75d5	1794138368753
17	5bc1f187efbaac09669774cbfb54818546a1d1878a9c9feaf62c0cac1550c2aa	1794395506454
\.


--
-- Data for Name: access_token_revocations; Type: TABLE DATA; Schema: public; Owner: pocketledger_user
--

COPY public.access_token_revocations (id, jti, user_id, session_id, reason, expires_at, revoked_at, user_agent, ip_address) FROM stdin;
\.


--
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: public; Owner: pocketledger_user
--

COPY public.audit_logs (id, actor_user_id, action, entity_type, entity_id, ip_address, user_agent, before, after, metadata, created_at) FROM stdin;
\.


--
-- Data for Name: email_outbox; Type: TABLE DATA; Schema: public; Owner: pocketledger_user
--

COPY public.email_outbox (id, recipient, template, encrypted_payload, encryption_key_version, status, attempt_count, available_at, sent_at, last_error, created_at, updated_at, max_attempts, processing_at, locked_by, lease_expires_at, claim_token) FROM stdin;
2d45f0b6-4b45-44b6-baaa-6dfc84089876	kolawolekehinde7033@gmail.com	registration_otp	xYNc4ZL8FhSM/8aF:kctpOgXhd6AOaJL2fglQWQ==:TifP2HVp2NzCnDTzXaq+EgbgAyPOfdgISO0ojdFbLO38STtMOw==	v2	sent	2	2026-11-14 09:24:19.578+00	2026-11-14 09:24:25.471+00	\N	2026-11-14 09:24:18.545725+00	2026-11-14 09:24:25.471+00	5	\N	\N	\N	\N
0cf34427-57fb-42e5-9e1f-479cbcc163dc	kolawoledhikrullah93@gmail.com	login_otp	6cF9zF5mPhiA3goy:nRuCLZ/GYHlXpaOVDaS+EQ==:/fj5E03UYh7euVsoHins2owWur+fzTg6awXIkI14i6fWPaeJbg==	v2	sent	1	2026-11-12 09:49:19.769+00	2026-11-12 09:49:24.104+00	\N	2026-11-12 09:49:19.711589+00	2026-11-12 09:49:24.104+00	5	\N	\N	\N	\N
a5ead75e-1381-469c-9348-e91ff935f72e	kolawoledhikrullah93@gmail.com	login_otp	jUVUH3iGUJo/eGiW:m2VcJo3uegXtowv8bocuQw==:y5/A3hUef/Lh2LUDexe+29TTLCPHIw90jFn8Go5i7V6L/nJnBw==	v2	sent	1	2026-11-12 10:03:05.269+00	2026-11-12 10:03:09.726+00	\N	2026-11-12 10:03:05.21545+00	2026-11-12 10:03:09.726+00	5	\N	\N	\N	\N
75f62f48-e514-42f4-886d-3592f5f242f1	kolawolekehinde7033@gmail.com	registration_otp	utd9HKoxN7sUa7Zq:PpFBYSevQ9lZEQn9bdWKSw==:YA5BtX8g47z8E4nBuiQe+TJcDCiOy6OCbzT38nfgQY2D7btnkw==	v2	sent	3	2026-11-14 09:25:18.996+00	2026-11-14 09:25:21.1+00	\N	2026-11-14 09:24:18.606418+00	2026-11-14 09:25:21.1+00	5	\N	\N	\N	\N
1dae1260-45ac-48e3-b4e5-f95d5e8b76ff	kolawolekehinde7033@gmail.com	registration_otp	VxDfk38g7aydUsVk:bH7gDZjrU4ZUHOXSr2zVFA==:bhyVZglKZlBvEtjWB6Le7ftYWem6+9xkmWqn4zg1Rlcv6uOiGA==	v2	sent	1	2026-11-14 09:24:14.244+00	2026-11-14 09:24:18.359+00	\N	2026-11-14 09:24:14.250359+00	2026-11-14 09:24:18.359+00	5	\N	\N	\N	\N
d736281c-848c-4ac7-8581-e83aec319454	kolawolekehinde7033@gmail.com	registration_otp	9bZP6WU5fc0G1qUH:w8devKBZWkEsY97R0FOCOQ==:HsBLpFgmwaRAm8BSWbWw2jycduUTz2CVWQcfx+j0ecJHRBn8eQ==	v2	sent	2	2026-11-14 09:24:18.741+00	2026-11-14 09:24:18.779+00	\N	2026-11-14 09:24:18.704988+00	2026-11-14 09:24:18.779+00	5	\N	\N	\N	\N
6a2002bd-e802-470f-b2b0-6f9ee50f5222	kolawolekehinde7033@gmail.com	registration_otp	+1RbY1a98Fx9euJn:DIxgyvQRqrmm3s27NLK8Qg==:MVbJH6u3Yj26usBrpzJ4tEZVf0GllbDsjCu16lVxOv7dTi4JPw==	v2	failed	5	2026-11-14 09:24:18.822+00	\N	Email delivery attempt failed	2026-11-14 09:24:18.805234+00	2026-11-14 09:24:18.822+00	5	\N	\N	\N	\N
1ce2a2bb-355c-47b3-bb99-c596ab144e23	kolawolekehinde7033@gmail.com	registration_otp	Zy4qgAnt0IRhK6SD:oh8pCgeIQZmKKb/f1bQ3gw==:2TTDWkNiiD1GNVC/SPIQ+t2Gt1lR3eXldNLUadE9dpsoABv2gw==	v2	sent	1	2026-11-14 09:24:16.847+00	2026-11-14 09:24:18.895+00	\N	2026-11-14 09:24:18.85888+00	2026-11-14 09:24:18.895+00	5	\N	\N	\N	\N
22f83c35-c173-4931-84a7-bee533e16a26	kolawolekehinde7033@gmail.com	registration_otp	qZ1uM4CHEfw7UT/c:dxUqJc6gZia17ckK62qyeQ==:VoD+eRdjho4UN7pSwWKHEfIcYCcWropr+ltIAmnUmVDbdonBxw==	v2	sent	2	2026-11-14 09:24:18.920575+00	2026-11-14 09:24:23.374+00	\N	2026-11-14 09:24:18.85888+00	2026-11-14 09:24:23.374+00	5	\N	\N	\N	\N
d754536d-00ac-44fe-b619-b72fc9c9318f	kolawoledhikrullah93@gmail.com	login_otp	iGNBJU1AvNEEwe3u:dhVD20OMIHGR86ivSdFdaA==:2HeuFNPe2w2HF5siAAusJvO/CInvdcskYCm7nBDWZejZXg7Lsw==	v2	failed	5	2026-11-12 09:58:32.415+00	\N	Email delivery attempt failed	2026-11-12 09:58:04.699706+00	2026-11-12 09:58:32.415+00	5	\N	\N	\N	\N
3b864f38-ac5c-4894-8a6d-8522d59dca8c	kolawolekehinde7033@gmail.com	registration_otp	TtA1T0rMuz5YfmvN:OhWtyvv0yJr83w4lGem15w==:6uaC+MH//pbH61U9N212cr0DNbJebNpXuICqddX9TjsJtcoLcA==	v2	sent	1	2026-11-13 20:46:25.028+00	2026-11-13 20:46:27.421+00	\N	2026-11-13 20:46:25.037545+00	2026-11-13 20:46:27.421+00	5	\N	\N	\N	\N
bdcfd174-2ea4-46cf-b116-6d4f3d1e3339	kolawolekehinde7033@gmail.com	registration_otp	sW+7HEJQlGqubUrj:0OGBVK6p5iaMzEScG7nr7g==:8uPgRrZ3VXzUEUZy8wR+bs4pOYFAQt4yxx2kws1zI+gdgw/SzA==	v2	sent	2	2026-11-13 20:46:27.52+00	2026-11-13 20:46:27.531+00	\N	2026-11-13 20:46:27.508809+00	2026-11-13 20:46:27.531+00	5	\N	\N	\N	\N
b66d8a5d-116e-46a6-9e04-adbe4bc14958	kolawolekehinde7033@gmail.com	registration_otp	PMN18Peb9SvyNKax:/DohRshwgXOxhI48LCGgEA==:jN/sZpwPSG1Cv7zwSfFIsTntezkwQUwNtpzd2HHdNg+KRZHhpw==	v2	failed	5	2026-11-13 20:46:27.546+00	\N	Email delivery attempt failed	2026-11-13 20:46:27.54752+00	2026-11-13 20:46:27.546+00	5	\N	\N	\N	\N
70a3277b-94f2-4dd2-9628-d9a19156c2d1	kolawolekehinde7033@gmail.com	registration_otp	4JBNxiYJ4OZ4AKOF:HF+H17rWMKBXj0tNTVoO3Q==:1Fjhy3ZWigE5CD8xyEBkdQ3YRHxwRvr9AaoFWonMhATAi6x3uA==	v2	sent	1	2026-11-13 20:46:25.554+00	2026-11-13 20:46:27.572+00	\N	2026-11-13 20:46:27.564618+00	2026-11-13 20:46:27.572+00	5	\N	\N	\N	\N
d679a408-e99c-4751-b24c-f5ef741ac41c	kolawolekehinde7033@gmail.com	registration_otp	RuPbN/ecosAG2Z5A:ga7h7MyM4Kovq6DMtsRZtw==:JTyVFc70FWzBd3aJRh7m6UR54o0iBUL1yKqRM8u6OU6QPQS5Pw==	v2	sent	3	2026-11-13 20:46:52.228+00	2026-11-13 20:47:12.965+00	\N	2026-11-13 20:46:27.447399+00	2026-11-13 20:47:12.965+00	5	\N	\N	\N	\N
19560e52-b75d-41f2-85b3-67698fc9c0fe	kolawolekehinde7033@gmail.com	registration_otp	vgyP+NJJnC3J9VB1:onkyw6Zse8B+fATcGLi36A==:D91twmg5KPwxriNrpvxEa0g1otpMPOXR5P2h53p0+84yYavd2g==	v2	sent	4	2026-11-13 20:47:06.03+00	2026-11-13 20:47:14.563+00	\N	2026-11-13 20:46:27.564618+00	2026-11-13 20:47:14.563+00	5	\N	\N	\N	\N
b77d0460-4fc5-4afd-849c-4ea1b98c10f1	kolawolekehinde7033@gmail.com	registration_otp	ACMbT3GtvmjSzbBz:inUyzDmcIHyP6ADnhOYDxg==:fY4r+jG3haDLhNUV/h4aI2X9UInUvB/xU0tiSNcBfW054daM7A==	v2	sent	4	2026-11-13 20:47:42.626+00	2026-11-13 20:48:07.509+00	\N	2026-11-13 20:46:27.478628+00	2026-11-13 20:48:07.509+00	5	\N	\N	\N	\N
\.


--
-- Data for Name: inbox_events; Type: TABLE DATA; Schema: public; Owner: pocketledger_user
--

COPY public.inbox_events (id, consumer_name, event_id, event_type, schema_version, status, attempts, max_attempts, available_at, processing_at, claim_token, locked_by, lease_expires_at, received_at, processed_at, failure_reason, created_at, updated_at, aggregate_type, aggregate_id, payload, correlation_id, occurred_at) FROM stdin;
\.


--
-- Data for Name: login_attempts; Type: TABLE DATA; Schema: public; Owner: pocketledger_user
--

COPY public.login_attempts (id, user_id, email, success, failure_reason, ip_address, user_agent, country, city, latitude, longitude, created_at) FROM stdin;
96d01a6f-8fb2-4d53-a80d-c7904600279e	25ca301e-a5db-4e68-af64-562e8a3d86db	kolawoledhikrullah93@gmail.com	t	\N	::1	PostmanRuntime/2.15.0	\N	\N	\N	\N	2026-11-12 09:49:44.849632+00
35d6f151-d217-43ba-8ac9-4ec812a1bb43	25ca301e-a5db-4e68-af64-562e8a3d86db	kolawoledhikrullah93@gmail.com	t	\N	::1	PostmanRuntime/2.15.0	\N	\N	\N	\N	2026-11-12 10:03:39.328207+00
\.


--
-- Data for Name: notification_deliveries; Type: TABLE DATA; Schema: public; Owner: pocketledger_user
--

COPY public.notification_deliveries (id, notification_id, channel, status, attempts, max_attempts, next_retry_at, provider_message_id, failure_reason, last_attempt_at, delivered_at, dead_lettered_at, locked_by, lease_expires_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: notification_preferences; Type: TABLE DATA; Schema: public; Owner: pocketledger_user
--

COPY public.notification_preferences (id, user_id, type, channel, enabled, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: pocketledger_user
--

COPY public.notifications (id, user_id, type, title, message, status, event_id, event_type, metadata, read_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: otp_challenges; Type: TABLE DATA; Schema: public; Owner: pocketledger_user
--

COPY public.otp_challenges (id, email, purpose, code_hash, expires_at, attempts, max_attempts, consumed_at, created_at) FROM stdin;
\.


--
-- Data for Name: outbox_events; Type: TABLE DATA; Schema: public; Owner: pocketledger_user
--

COPY public.outbox_events (id, event_type, schema_version, aggregate_type, aggregate_id, payload, correlation_id, status, attempts, max_attempts, available_at, processing_at, locked_by, lease_expires_at, occurred_at, published_at, last_error, created_at, updated_at, aggregate_sequence, claim_token) FROM stdin;
\.


--
-- Data for Name: pending_registrations; Type: TABLE DATA; Schema: public; Owner: pocketledger_user
--

COPY public.pending_registrations (id, email, email_verified_at, expires_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: refresh_tokens; Type: TABLE DATA; Schema: public; Owner: pocketledger_user
--

COPY public.refresh_tokens (id, session_id, token_hash, expires_at, revoked_at, replaced_by_token_id, created_at) FROM stdin;
0ef279e9-87de-4749-a625-8935ab6ed2d1	da78d441-3d08-4737-b083-3f90b62c6533	3cd880d5d37f5117a779cd53b066edb5f74bf51cedc338c6d9d8b4a161578b0a	2026-12-12 09:49:44.884+00	\N	\N	2026-11-12 09:49:44.849632+00
a19f17ac-2d75-4523-bbbf-a8b372e040a5	5134f287-cdcd-4799-b121-6cd40e129907	ab26aa4e68b1aa83e190a563125bdf85cfa5c5c7bfd56a7c9badaf722b96c5c3	2026-12-12 10:03:39.346+00	2026-11-12 10:05:54.446+00	\N	2026-11-12 10:03:39.328207+00
\.


--
-- Data for Name: security_events; Type: TABLE DATA; Schema: public; Owner: pocketledger_user
--

COPY public.security_events (id, user_id, type, severity, ip_address, user_agent, country, city, metadata, resolved_at, created_at) FROM stdin;
db78602f-3f72-4e93-98c1-210ce34be45e	25ca301e-a5db-4e68-af64-562e8a3d86db	otp_requested	low	::1	PostmanRuntime/2.15.0	\N	\N	{"email": "kolawoledhikrullah93@gmail.com", "purpose": "login"}	\N	2026-11-12 09:49:19.711589+00
e09e172e-29ce-4b6c-8951-37b1647609c3	25ca301e-a5db-4e68-af64-562e8a3d86db	otp_verified	low	::1	PostmanRuntime/2.15.0	\N	\N	{"email": "kolawoledhikrullah93@gmail.com", "purpose": "login"}	\N	2026-11-12 09:49:44.849632+00
2d22332e-75c2-4cb2-8224-92074ee20366	25ca301e-a5db-4e68-af64-562e8a3d86db	session_created	low	::1	PostmanRuntime/2.15.0	\N	\N	{"sessionId": "da78d441-3d08-4737-b083-3f90b62c6533", "deviceName": null}	\N	2026-11-12 09:49:44.849632+00
79da66a8-9684-4365-8005-73d8935ab22f	25ca301e-a5db-4e68-af64-562e8a3d86db	login_succeeded	low	::1	PostmanRuntime/2.15.0	\N	\N	{"sessionId": "da78d441-3d08-4737-b083-3f90b62c6533"}	\N	2026-11-12 09:49:44.849632+00
8fc49dea-7ab6-4c0d-b7fe-d658d67e143e	25ca301e-a5db-4e68-af64-562e8a3d86db	otp_requested	low	::1	PostmanRuntime/2.15.0	\N	\N	{"email": "kolawoledhikrullah93@gmail.com", "purpose": "login"}	\N	2026-11-12 09:58:04.699706+00
93935e62-8c25-4bc3-828f-d299d1f26ad0	25ca301e-a5db-4e68-af64-562e8a3d86db	otp_requested	low	::1	PostmanRuntime/2.15.0	\N	\N	{"email": "kolawoledhikrullah93@gmail.com", "purpose": "login"}	\N	2026-11-12 10:03:05.21545+00
dfad4a12-fd77-4c61-92c2-fa8d9377587e	25ca301e-a5db-4e68-af64-562e8a3d86db	otp_verified	low	::1	PostmanRuntime/2.15.0	\N	\N	{"email": "kolawoledhikrullah93@gmail.com", "purpose": "login"}	\N	2026-11-12 10:03:39.328207+00
9319b6e9-acbc-4a74-87f7-97180cde74ef	25ca301e-a5db-4e68-af64-562e8a3d86db	session_created	low	::1	PostmanRuntime/2.15.0	\N	\N	{"sessionId": "5134f287-cdcd-4799-b121-6cd40e129907", "deviceName": null}	\N	2026-11-12 10:03:39.328207+00
5a07ad1f-fddb-42d8-9a23-96c6f8ad64f9	25ca301e-a5db-4e68-af64-562e8a3d86db	login_succeeded	low	::1	PostmanRuntime/2.15.0	\N	\N	{"sessionId": "5134f287-cdcd-4799-b121-6cd40e129907"}	\N	2026-11-12 10:03:39.328207+00
f681bd01-cd11-4996-94bd-678a188e8388	25ca301e-a5db-4e68-af64-562e8a3d86db	access_token_revoked	low	::1	PostmanRuntime/2.15.0	\N	\N	{"reason": "user_logout", "sessionId": "5134f287-cdcd-4799-b121-6cd40e129907"}	\N	2026-11-12 10:05:54.431295+00
6990fcf4-73a7-49a1-9613-a94aba7292c1	25ca301e-a5db-4e68-af64-562e8a3d86db	session_revoked	low	::1	PostmanRuntime/2.15.0	\N	\N	{"reason": "user_logout", "sessionId": "5134f287-cdcd-4799-b121-6cd40e129907"}	\N	2026-11-12 10:05:54.431295+00
a76d1e4a-6499-4b0e-9441-a956b2688914	25ca301e-a5db-4e68-af64-562e8a3d86db	suspicious_activity_detected	high	::1	PostmanRuntime/2.15.0	\N	\N	{"jti": "a5b84baa-3ae9-4384-95f5-6bfe1ce18f9a", "reason": "revoked_access_token", "sessionId": "5134f287-cdcd-4799-b121-6cd40e129907"}	\N	2026-11-12 10:06:05.625816+00
99299c1c-fd36-45f8-8e80-8de9268bda65	25ca301e-a5db-4e68-af64-562e8a3d86db	suspicious_activity_detected	high	::1	PostmanRuntime/2.15.0	\N	\N	{"jti": "a5b84baa-3ae9-4384-95f5-6bfe1ce18f9a", "reason": "revoked_access_token", "sessionId": "5134f287-cdcd-4799-b121-6cd40e129907"}	\N	2026-11-12 10:06:17.952159+00
\.


--
-- Data for Name: sessions; Type: TABLE DATA; Schema: public; Owner: pocketledger_user
--

COPY public.sessions (id, user_id, device_name, user_agent, ip_address, country, city, last_activity_at, expires_at, revoked_at, revoke_reason, created_at, updated_at) FROM stdin;
da78d441-3d08-4737-b083-3f90b62c6533	25ca301e-a5db-4e68-af64-562e8a3d86db	\N	PostmanRuntime/2.15.0	::1	\N	\N	2026-11-12 09:49:44.884+00	2026-12-12 09:49:44.884+00	\N	\N	2026-11-12 09:49:44.849632+00	2026-11-12 09:49:44.849632+00
5134f287-cdcd-4799-b121-6cd40e129907	25ca301e-a5db-4e68-af64-562e8a3d86db	\N	PostmanRuntime/2.15.0	::1	\N	\N	2026-11-12 10:03:39.346+00	2026-12-12 10:03:39.346+00	2026-11-12 10:05:54.439+00	user_logout	2026-11-12 10:03:39.328207+00	2026-11-12 10:05:54.439+00
\.


--
-- Data for Name: user_permission_overrides; Type: TABLE DATA; Schema: public; Owner: pocketledger_user
--

COPY public.user_permission_overrides (id, user_id, permission, effect, actor_user_id, reason, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: pocketledger_user
--

COPY public.users (id, first_name, last_name, middle_name, username, phone_number, email, role, status, created_at, updated_at) FROM stdin;
25ca301e-a5db-4e68-af64-562e8a3d86db	Jane	Doe	A.	jane.doe	+2348012345678	kolawoledhikrullah93@gmail.com	customer	active	2026-11-09 10:09:56.032097+00	2026-11-09 10:09:56.032097+00
\.


--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE SET; Schema: drizzle; Owner: pocketledger_user
--

SELECT pg_catalog.setval('drizzle.__drizzle_migrations_id_seq', 17, true);


--
-- Name: __drizzle_migrations __drizzle_migrations_pkey; Type: CONSTRAINT; Schema: drizzle; Owner: pocketledger_user
--

ALTER TABLE ONLY drizzle.__drizzle_migrations
    ADD CONSTRAINT __drizzle_migrations_pkey PRIMARY KEY (id);


--
-- Name: access_token_revocations access_token_revocations_pkey; Type: CONSTRAINT; Schema: public; Owner: pocketledger_user
--

ALTER TABLE ONLY public.access_token_revocations
    ADD CONSTRAINT access_token_revocations_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: pocketledger_user
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: email_outbox email_outbox_pkey; Type: CONSTRAINT; Schema: public; Owner: pocketledger_user
--

ALTER TABLE ONLY public.email_outbox
    ADD CONSTRAINT email_outbox_pkey PRIMARY KEY (id);


--
-- Name: inbox_events inbox_events_pkey; Type: CONSTRAINT; Schema: public; Owner: pocketledger_user
--

ALTER TABLE ONLY public.inbox_events
    ADD CONSTRAINT inbox_events_pkey PRIMARY KEY (id);


--
-- Name: login_attempts login_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: pocketledger_user
--

ALTER TABLE ONLY public.login_attempts
    ADD CONSTRAINT login_attempts_pkey PRIMARY KEY (id);


--
-- Name: notification_deliveries notification_deliveries_pkey; Type: CONSTRAINT; Schema: public; Owner: pocketledger_user
--

ALTER TABLE ONLY public.notification_deliveries
    ADD CONSTRAINT notification_deliveries_pkey PRIMARY KEY (id);


--
-- Name: notification_preferences notification_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: pocketledger_user
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: pocketledger_user
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: otp_challenges otp_challenges_pkey; Type: CONSTRAINT; Schema: public; Owner: pocketledger_user
--

ALTER TABLE ONLY public.otp_challenges
    ADD CONSTRAINT otp_challenges_pkey PRIMARY KEY (id);


--
-- Name: outbox_events outbox_events_pkey; Type: CONSTRAINT; Schema: public; Owner: pocketledger_user
--

ALTER TABLE ONLY public.outbox_events
    ADD CONSTRAINT outbox_events_pkey PRIMARY KEY (id);


--
-- Name: pending_registrations pending_registrations_pkey; Type: CONSTRAINT; Schema: public; Owner: pocketledger_user
--

ALTER TABLE ONLY public.pending_registrations
    ADD CONSTRAINT pending_registrations_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: pocketledger_user
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: security_events security_events_pkey; Type: CONSTRAINT; Schema: public; Owner: pocketledger_user
--

ALTER TABLE ONLY public.security_events
    ADD CONSTRAINT security_events_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: pocketledger_user
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: user_permission_overrides user_permission_overrides_pkey; Type: CONSTRAINT; Schema: public; Owner: pocketledger_user
--

ALTER TABLE ONLY public.user_permission_overrides
    ADD CONSTRAINT user_permission_overrides_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: pocketledger_user
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: access_token_revocations_expires_at_idx; Type: INDEX; Schema: public; Owner: pocketledger_user
--

CREATE INDEX access_token_revocations_expires_at_idx ON public.access_token_revocations USING btree (expires_at);


--
-- Name: access_token_revocations_jti_unique; Type: INDEX; Schema: public; Owner: pocketledger_user
--

CREATE UNIQUE INDEX access_token_revocations_jti_unique ON public.access_token_revocations USING btree (jti);


--
-- Name: access_token_revocations_session_id_idx; Type: INDEX; Schema: public; Owner: pocketledger_user
--

CREATE INDEX access_token_revocations_session_id_idx ON public.access_token_revocations USING btree (session_id);


--
-- Name: access_token_revocations_user_id_idx; Type: INDEX; Schema: public; Owner: pocketledger_user
--

CREATE INDEX access_token_revocations_user_id_idx ON public.access_token_revocations USING btree (user_id);


--
-- Name: audit_logs_action_idx; Type: INDEX; Schema: public; Owner: pocketledger_user
--

CREATE INDEX audit_logs_action_idx ON public.audit_logs USING btree (action);


--
-- Name: audit_logs_actor_user_id_idx; Type: INDEX; Schema: public; Owner: pocketledger_user
--

CREATE INDEX audit_logs_actor_user_id_idx ON public.audit_logs USING btree (actor_user_id);


--
-- Name: audit_logs_created_at_idx; Type: INDEX; Schema: public; Owner: pocketledger_user
--

CREATE INDEX audit_logs_created_at_idx ON public.audit_logs USING btree (created_at);


--
-- Name: audit_logs_entity_idx; Type: INDEX; Schema: public; Owner: pocketledger_user
--

CREATE INDEX audit_logs_entity_idx ON public.audit_logs USING btree (entity_type, entity_id);


--
-- Name: email_outbox_created_at_idx; Type: INDEX; Schema: public; Owner: pocketledger_user
--

CREATE INDEX email_outbox_created_at_idx ON public.email_outbox USING btree (created_at);


--
-- Name: email_outbox_status_available_at_idx; Type: INDEX; Schema: public; Owner: pocketledger_user
--

CREATE INDEX email_outbox_status_available_at_idx ON public.email_outbox USING btree (status, available_at);


--
-- Name: email_outbox_status_lease_expires_at_idx; Type: INDEX; Schema: public; Owner: pocketledger_user
--

CREATE INDEX email_outbox_status_lease_expires_at_idx ON public.email_outbox USING btree (status, lease_expires_at);


--
-- Name: inbox_events_consumer_event_unique; Type: INDEX; Schema: public; Owner: pocketledger_user
--

CREATE UNIQUE INDEX inbox_events_consumer_event_unique ON public.inbox_events USING btree (consumer_name, event_id);


--
-- Name: inbox_events_created_at_idx; Type: INDEX; Schema: public; Owner: pocketledger_user
--

CREATE INDEX inbox_events_created_at_idx ON public.inbox_events USING btree (created_at);


--
-- Name: inbox_events_event_type_idx; Type: INDEX; Schema: public; Owner: pocketledger_user
--

CREATE INDEX inbox_events_event_type_idx ON public.inbox_events USING btree (event_type);


--
-- Name: inbox_events_status_available_at_idx; Type: INDEX; Schema: public; Owner: pocketledger_user
--

CREATE INDEX inbox_events_status_available_at_idx ON public.inbox_events USING btree (status, available_at);


--
-- Name: inbox_events_status_lease_expires_at_idx; Type: INDEX; Schema: public; Owner: pocketledger_user
--

CREATE INDEX inbox_events_status_lease_expires_at_idx ON public.inbox_events USING btree (status, lease_expires_at);


--
-- Name: login_attempts_created_at_idx; Type: INDEX; Schema: public; Owner: pocketledger_user
--

CREATE INDEX login_attempts_created_at_idx ON public.login_attempts USING btree (created_at);


--
-- Name: login_attempts_email_idx; Type: INDEX; Schema: public; Owner: pocketledger_user
--

CREATE INDEX login_attempts_email_idx ON public.login_attempts USING btree (email);


--
-- Name: login_attempts_ip_address_idx; Type: INDEX; Schema: public; Owner: pocketledger_user
--

CREATE INDEX login_attempts_ip_address_idx ON public.login_attempts USING btree (ip_address);


--
-- Name: login_attempts_user_id_idx; Type: INDEX; Schema: public; Owner: pocketledger_user
--

CREATE INDEX login_attempts_user_id_idx ON public.login_attempts USING btree (user_id);


--
-- Name: notification_deliveries_lease_idx; Type: INDEX; Schema: public; Owner: pocketledger_user
--

CREATE INDEX notification_deliveries_lease_idx ON public.notification_deliveries USING btree (status, lease_expires_at);


--
-- Name: notification_deliveries_notification_channel_unique; Type: INDEX; Schema: public; Owner: pocketledger_user
--

CREATE UNIQUE INDEX notification_deliveries_notification_channel_unique ON public.notification_deliveries USING btree (notification_id, channel);


--
-- Name: notification_deliveries_notification_id_idx; Type: INDEX; Schema: public; Owner: pocketledger_user
--

CREATE INDEX notification_deliveries_notification_id_idx ON public.notification_deliveries USING btree (notification_id);


--
-- Name: notification_deliveries_retry_idx; Type: INDEX; Schema: public; Owner: pocketledger_user
--

CREATE INDEX notification_deliveries_retry_idx ON public.notification_deliveries USING btree (status, next_retry_at, created_at);


--
-- Name: notification_deliveries_status_idx; Type: INDEX; Schema: public; Owner: pocketledger_user
--

CREATE INDEX notification_deliveries_status_idx ON public.notification_deliveries USING btree (status);


--
-- Name: notification_preferences_user_id_idx; Type: INDEX; Schema: public; Owner: pocketledger_user
--

CREATE INDEX notification_preferences_user_id_idx ON public.notification_preferences USING btree (user_id);


--
-- Name: notification_preferences_user_type_channel_unique; Type: INDEX; Schema: public; Owner: pocketledger_user
--

CREATE UNIQUE INDEX notification_preferences_user_type_channel_unique ON public.notification_preferences USING btree (user_id, type, channel);


--
-- Name: notifications_event_id_idx; Type: INDEX; Schema: public; Owner: pocketledger_user
--

CREATE INDEX notifications_event_id_idx ON public.notifications USING btree (event_id);


--
-- Name: notifications_event_user_type_unique; Type: INDEX; Schema: public; Owner: pocketledger_user
--

CREATE UNIQUE INDEX notifications_event_user_type_unique ON public.notifications USING btree (event_id, user_id, type);


--
-- Name: notifications_user_created_at_idx; Type: INDEX; Schema: public; Owner: pocketledger_user
--

CREATE INDEX notifications_user_created_at_idx ON public.notifications USING btree (user_id, created_at);


--
-- Name: notifications_user_read_at_idx; Type: INDEX; Schema: public; Owner: pocketledger_user
--

CREATE INDEX notifications_user_read_at_idx ON public.notifications USING btree (user_id, read_at);


--
-- Name: otp_challenges_email_purpose_idx; Type: INDEX; Schema: public; Owner: pocketledger_user
--

CREATE INDEX otp_challenges_email_purpose_idx ON public.otp_challenges USING btree (email, purpose);


--
-- Name: otp_challenges_expires_at_idx; Type: INDEX; Schema: public; Owner: pocketledger_user
--

CREATE INDEX otp_challenges_expires_at_idx ON public.otp_challenges USING btree (expires_at);


--
-- Name: outbox_events_aggregate_idx; Type: INDEX; Schema: public; Owner: pocketledger_user
--

CREATE INDEX outbox_events_aggregate_idx ON public.outbox_events USING btree (aggregate_type, aggregate_id);


--
-- Name: outbox_events_aggregate_sequence_idx; Type: INDEX; Schema: public; Owner: pocketledger_user
--

CREATE INDEX outbox_events_aggregate_sequence_idx ON public.outbox_events USING btree (aggregate_type, aggregate_id, aggregate_sequence);


--
-- Name: outbox_events_created_at_idx; Type: INDEX; Schema: public; Owner: pocketledger_user
--

CREATE INDEX outbox_events_created_at_idx ON public.outbox_events USING btree (created_at);


--
-- Name: outbox_events_event_type_idx; Type: INDEX; Schema: public; Owner: pocketledger_user
--

CREATE INDEX outbox_events_event_type_idx ON public.outbox_events USING btree (event_type);


--
-- Name: outbox_events_lease_expires_at_idx; Type: INDEX; Schema: public; Owner: pocketledger_user
--

CREATE INDEX outbox_events_lease_expires_at_idx ON public.outbox_events USING btree (status, lease_expires_at);


--
-- Name: outbox_events_status_available_at_idx; Type: INDEX; Schema: public; Owner: pocketledger_user
--

CREATE INDEX outbox_events_status_available_at_idx ON public.outbox_events USING btree (status, available_at);


--
-- Name: pending_registrations_email_unique; Type: INDEX; Schema: public; Owner: pocketledger_user
--

CREATE UNIQUE INDEX pending_registrations_email_unique ON public.pending_registrations USING btree (email);


--
-- Name: refresh_tokens_expires_at_idx; Type: INDEX; Schema: public; Owner: pocketledger_user
--

CREATE INDEX refresh_tokens_expires_at_idx ON public.refresh_tokens USING btree (expires_at);


--
-- Name: refresh_tokens_one_active_per_session; Type: INDEX; Schema: public; Owner: pocketledger_user
--

CREATE UNIQUE INDEX refresh_tokens_one_active_per_session ON public.refresh_tokens USING btree (session_id) WHERE (revoked_at IS NULL);


--
-- Name: refresh_tokens_session_id_idx; Type: INDEX; Schema: public; Owner: pocketledger_user
--

CREATE INDEX refresh_tokens_session_id_idx ON public.refresh_tokens USING btree (session_id);


--
-- Name: refresh_tokens_token_hash_unique; Type: INDEX; Schema: public; Owner: pocketledger_user
--

CREATE UNIQUE INDEX refresh_tokens_token_hash_unique ON public.refresh_tokens USING btree (token_hash);


--
-- Name: security_events_created_at_idx; Type: INDEX; Schema: public; Owner: pocketledger_user
--

CREATE INDEX security_events_created_at_idx ON public.security_events USING btree (created_at);


--
-- Name: security_events_severity_idx; Type: INDEX; Schema: public; Owner: pocketledger_user
--

CREATE INDEX security_events_severity_idx ON public.security_events USING btree (severity);


--
-- Name: security_events_type_idx; Type: INDEX; Schema: public; Owner: pocketledger_user
--

CREATE INDEX security_events_type_idx ON public.security_events USING btree (type);


--
-- Name: security_events_user_id_idx; Type: INDEX; Schema: public; Owner: pocketledger_user
--

CREATE INDEX security_events_user_id_idx ON public.security_events USING btree (user_id);


--
-- Name: sessions_expires_at_idx; Type: INDEX; Schema: public; Owner: pocketledger_user
--

CREATE INDEX sessions_expires_at_idx ON public.sessions USING btree (expires_at);


--
-- Name: sessions_revoked_at_idx; Type: INDEX; Schema: public; Owner: pocketledger_user
--

CREATE INDEX sessions_revoked_at_idx ON public.sessions USING btree (revoked_at);


--
-- Name: sessions_user_id_idx; Type: INDEX; Schema: public; Owner: pocketledger_user
--

CREATE INDEX sessions_user_id_idx ON public.sessions USING btree (user_id);


--
-- Name: user_permission_overrides_user_id_idx; Type: INDEX; Schema: public; Owner: pocketledger_user
--

CREATE INDEX user_permission_overrides_user_id_idx ON public.user_permission_overrides USING btree (user_id);


--
-- Name: user_permission_overrides_user_permission_unique; Type: INDEX; Schema: public; Owner: pocketledger_user
--

CREATE UNIQUE INDEX user_permission_overrides_user_permission_unique ON public.user_permission_overrides USING btree (user_id, permission);


--
-- Name: users_email_unique; Type: INDEX; Schema: public; Owner: pocketledger_user
--

CREATE UNIQUE INDEX users_email_unique ON public.users USING btree (email);


--
-- Name: users_phone_number_unique; Type: INDEX; Schema: public; Owner: pocketledger_user
--

CREATE UNIQUE INDEX users_phone_number_unique ON public.users USING btree (phone_number);


--
-- Name: users_username_unique; Type: INDEX; Schema: public; Owner: pocketledger_user
--

CREATE UNIQUE INDEX users_username_unique ON public.users USING btree (username);


--
-- Name: access_token_revocations access_token_revocations_session_id_sessions_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: pocketledger_user
--

ALTER TABLE ONLY public.access_token_revocations
    ADD CONSTRAINT access_token_revocations_session_id_sessions_id_fk FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;


--
-- Name: access_token_revocations access_token_revocations_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: pocketledger_user
--

ALTER TABLE ONLY public.access_token_revocations
    ADD CONSTRAINT access_token_revocations_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: audit_logs audit_logs_actor_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: pocketledger_user
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_actor_user_id_users_id_fk FOREIGN KEY (actor_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: login_attempts login_attempts_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: pocketledger_user
--

ALTER TABLE ONLY public.login_attempts
    ADD CONSTRAINT login_attempts_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: notification_deliveries notification_deliveries_notification_id_notifications_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: pocketledger_user
--

ALTER TABLE ONLY public.notification_deliveries
    ADD CONSTRAINT notification_deliveries_notification_id_notifications_id_fk FOREIGN KEY (notification_id) REFERENCES public.notifications(id) ON DELETE CASCADE;


--
-- Name: notification_preferences notification_preferences_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: pocketledger_user
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: pocketledger_user
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: refresh_tokens refresh_tokens_session_id_sessions_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: pocketledger_user
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_session_id_sessions_id_fk FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;


--
-- Name: security_events security_events_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: pocketledger_user
--

ALTER TABLE ONLY public.security_events
    ADD CONSTRAINT security_events_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: sessions sessions_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: pocketledger_user
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_permission_overrides user_permission_overrides_actor_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: pocketledger_user
--

ALTER TABLE ONLY public.user_permission_overrides
    ADD CONSTRAINT user_permission_overrides_actor_user_id_users_id_fk FOREIGN KEY (actor_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: user_permission_overrides user_permission_overrides_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: pocketledger_user
--

ALTER TABLE ONLY public.user_permission_overrides
    ADD CONSTRAINT user_permission_overrides_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict SGGFfovasOjeN3kmJlIFryjimehbvEfL6qgeObFeNwLcwiFhk7AzpRnnqJvog0x

