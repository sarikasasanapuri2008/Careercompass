import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownRight, ArrowRight, ArrowUpRight, BookOpen, BriefcaseBusiness, Check,
  CheckCircle2, ChevronDown, CircleHelp, Clock3, Compass, ExternalLink, FileUser,
  LoaderCircle, MessageCircle, Search, Send, ShieldCheck, Sparkles, UserRound,
} from 'lucide-react';
import {
  getGetProfileQueryKey, getListOpportunitiesQueryKey, useCheckEligibility,
  useGetAiMatch, useGetProfile, useListOpportunities, useSaveProfile, useSendAiChat,
} from '@workspace/api-client-react';
import type {
  AiMatchResponse, ChatTurn, EligibilityResult, Opportunity, ProfileInput,
} from '@workspace/api-client-react';

type View = 'profile' | 'opportunities' | 'assistant';
type ProfileDraft = ProfileInput;

const queryClient = new QueryClient();
const emptyDraft: ProfileDraft = {
  age: 18, category: 'GENERAL', degree: 'SECONDARY', branch: '', skills: [], dailyHours: 2,
};

function getOrCreateProfileId() {
  const key = 'career-compass-profile-id';
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const next = window.crypto?.randomUUID?.() ?? `cc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  window.localStorage.setItem(key, next);
  return next;
}

function AppContent() {
  const profileId = useMemo(() => getOrCreateProfileId(), []);
  const profileQuery = useGetProfile(profileId, {
    query: { enabled: Boolean(profileId), queryKey: getGetProfileQueryKey(profileId) },
  });
  const opportunitiesQuery = useListOpportunities({
    query: { queryKey: getListOpportunitiesQueryKey() },
  });
  const saveProfile = useSaveProfile();
  const checkEligibility = useCheckEligibility();
  const getAiMatch = useGetAiMatch();
  const sendAiChat = useSendAiChat();
  const cache = useQueryClient();

  const [view, setView] = useState<View>('profile');
  const [draft, setDraft] = useState<ProfileDraft>(emptyDraft);
  const [skillsText, setSkillsText] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [activeOpportunityId, setActiveOpportunityId] = useState('');
  const [query, setQuery] = useState('');
  const [domainFilter, setDomainFilter] = useState<'ALL' | 'GOVERNMENT' | 'PRIVATE'>('ALL');
  const [eligibilityById, setEligibilityById] = useState<Record<string, EligibilityResult>>({});
  const [matchesById, setMatchesById] = useState<Record<string, AiMatchResponse>>({});
  const [chatById, setChatById] = useState<Record<string, ChatTurn[]>>({});
  const [chatInput, setChatInput] = useState('');
  const [chatError, setChatError] = useState('');
  const firstHydration = useRef(true);

  useEffect(() => {
    const profile = profileQuery.data;
    if (profile && firstHydration.current && !isDirty) {
      setDraft({
        age: profile.age,
        category: profile.category,
        degree: profile.degree,
        branch: profile.branch,
        skills: profile.skills,
        dailyHours: profile.dailyHours,
      });
      setSkillsText(profile.skills.join(', '));
      firstHydration.current = false;
    }
  }, [profileQuery.data, isDirty]);

  const opportunities = opportunitiesQuery.data ?? [];
  const activeOpportunity = opportunities.find((item) => item.id === activeOpportunityId);
  const filteredOpportunities = opportunities.filter((item) => {
    const matchesDomain = domainFilter === 'ALL' || item.domain === domainFilter;
    const needle = query.trim().toLowerCase();
    return matchesDomain && (!needle || `${item.title} ${item.domain} ${item.minDegree} ${item.allowedBranches.join(' ')} ${item.requiredSkills.join(' ')}`.toLowerCase().includes(needle));
  });
  const hasSavedProfile = Boolean(profileQuery.data) || Boolean(saveProfile.data);
  const selectedTurns = activeOpportunityId ? (chatById[activeOpportunityId] ?? []) : [];

  function updateDraft<K extends keyof ProfileDraft>(field: K, value: ProfileDraft[K]) {
    setDraft((current) => ({ ...current, [field]: value }));
    setIsDirty(true);
  }

  function handleSaveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanSkills = skillsText.split(',').map((skill) => skill.trim()).filter(Boolean);
    const payload: ProfileDraft = { ...draft, age: Number(draft.age), dailyHours: Number(draft.dailyHours), skills: cleanSkills };
    setDraft(payload);
    setIsDirty(false);
    saveProfile.mutate({ profileId, data: payload }, {
      onSuccess: (saved) => {
        firstHydration.current = false;
        cache.setQueryData(getGetProfileQueryKey(profileId), saved);
      },
      onError: () => setIsDirty(true),
    });
  }

  function runEligibility(opportunity: Opportunity) {
    if (!hasSavedProfile) return;
    checkEligibility.mutate({ data: { profileId, opportunityId: opportunity.id } }, {
      onSuccess: (result) => setEligibilityById((current) => ({ ...current, [opportunity.id]: result })),
    });
  }

  function runMatch(opportunity: Opportunity) {
    if (!hasSavedProfile) return;
    getAiMatch.mutate({ data: { profileId, opportunityId: opportunity.id } }, {
      onSuccess: (result) => setMatchesById((current) => ({ ...current, [opportunity.id]: result })),
    });
  }

  function submitChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = chatInput.trim();
    if (!message || !activeOpportunity || !hasSavedProfile || sendAiChat.isPending) return;
    const previous = chatById[activeOpportunity.id] ?? [];
    const updated = [...previous, { role: 'user' as const, content: message }];
    setChatById((current) => ({ ...current, [activeOpportunity.id]: updated }));
    setChatInput('');
    setChatError('');
    sendAiChat.mutate({
      data: {
        profileId,
        opportunityId: activeOpportunity.id,
        message,
        history: previous.slice(-12),
      },
    }, {
      onSuccess: (result) => {
        setChatById((current) => ({
          ...current,
          [activeOpportunity.id]: [...(current[activeOpportunity.id] ?? updated), { role: 'assistant', content: result.reply }],
        }));
      },
      onError: () => setChatError('Your message could not be sent. Please try again.'),
    });
  }

  function openAssistant(opportunityId?: string) {
    if (opportunityId) setActiveOpportunityId(opportunityId);
    setView('assistant');
  }

  const tabs: { id: View; label: string; icon: typeof UserRound; count?: string }[] = [
    { id: 'profile', label: 'Your profile', icon: UserRound, count: hasSavedProfile ? '01' : undefined },
    { id: 'opportunities', label: 'Opportunities', icon: Compass, count: opportunitiesQuery.data ? String(opportunities.length).padStart(2, '0') : undefined },
    { id: 'assistant', label: 'Career assistant', icon: MessageCircle },
  ];

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <header className="border-b border-border/80 bg-[#f7f4eb]">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between px-5 py-4 sm:px-8 lg:px-12">
          <button type="button" onClick={() => setView('profile')} className="group flex items-center gap-3 text-left" data-testid="button-brand-home">
            <span className="grid h-10 w-10 place-items-center rounded-[14px] bg-primary text-primary-foreground shadow-sm transition-transform group-hover:-rotate-6">
              <Compass size={21} strokeWidth={1.8} />
            </span>
            <span>
              <span className="display block text-[15px] font-extrabold tracking-[-.04em]">CareerCompass <span className="text-primary">AI</span></span>
              <span className="mono block text-[9px] uppercase tracking-[.18em] text-muted-foreground">A clearer next step</span>
            </span>
          </button>
          <div className="hidden items-center gap-2 rounded-full border border-[#d9d8c9] bg-[#efeee4] px-3 py-2 text-[11px] text-[#4a635d] sm:flex">
            <ShieldCheck size={14} />
            <span>Guidance, not an official decision</span>
          </div>
          <span className="mono text-[10px] text-muted-foreground sm:hidden">INDIA · CAREER GUIDE</span>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1440px] gap-7 px-4 pb-12 pt-7 sm:px-8 sm:pt-10 lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-12 lg:px-12 lg:pt-12">
        <aside className="lg:sticky lg:top-8 lg:self-start">
          <div className="mb-7 px-1">
            <p className="mono mb-3 text-[10px] uppercase tracking-[.22em] text-primary">Your compass</p>
            <h1 className="display max-w-[220px] text-[26px] font-semibold leading-[1.12] tracking-[-.05em] sm:text-[29px]">A good plan starts with <span className="text-primary">what’s true.</span></h1>
            <p className="mt-3 max-w-[235px] text-[13px] leading-5 text-muted-foreground">Know where you stand. See what to work on next.</p>
          </div>
          <nav aria-label="Workspace sections" className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:gap-1 lg:overflow-visible">
            {tabs.map(({ id, label, icon: Icon, count }) => (
              <button
                key={id}
                type="button"
                onClick={() => setView(id)}
                className={`flex shrink-0 items-center gap-3 rounded-xl px-3 py-3 text-left text-[13px] transition-all ${view === id ? 'bg-primary text-primary-foreground shadow-[0_8px_18px_rgba(40,86,74,.15)]' : 'text-muted-foreground hover:bg-[#eae9de] hover:text-foreground'}`}
                aria-current={view === id ? 'page' : undefined}
                data-testid={`nav-${id}`}
              >
                <Icon size={17} strokeWidth={1.8} />
                <span className="flex-1 whitespace-nowrap font-medium">{label}</span>
                {count && <span className={`mono text-[10px] ${view === id ? 'text-primary-foreground/65' : 'text-muted-foreground/70'}`}>{count}</span>}
              </button>
            ))}
          </nav>
          <div className="mt-6 hidden rounded-2xl border border-[#dedbce] bg-[#eeece1] p-4 lg:block">
            <div className="mb-3 flex items-center gap-2 text-primary"><CircleHelp size={16} /><span className="mono text-[10px] uppercase tracking-[.14em]">A note on results</span></div>
            <p className="text-[12px] leading-[1.65] text-muted-foreground">Use this as a starting point. Always confirm details with the official opportunity notice.</p>
          </div>
          <div className="mt-5 hidden items-center gap-2 px-2 lg:flex">
            <span className={`h-2 w-2 rounded-full ${profileQuery.isError ? 'bg-[#b55c4b]' : hasSavedProfile ? 'bg-primary' : 'bg-[#d2a450]'}`} />
            <span className="text-[11px] text-muted-foreground" data-testid="status-profile-sync">{profileQuery.isError ? 'Profile needs attention' : hasSavedProfile ? 'Profile saved' : 'Profile not saved yet'}</span>
          </div>
        </aside>

        <section className="min-w-0">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
            <div>
              <p className="mono mb-2 text-[10px] uppercase tracking-[.2em] text-primary">
                {view === 'profile' ? '01 / Candidate snapshot' : view === 'opportunities' ? '02 / Explore your options' : '03 / A grounded conversation'}
              </p>
              <h2 className="display text-[28px] font-semibold leading-tight tracking-[-.045em] sm:text-[34px]">
                {view === 'profile' ? 'Build your profile' : view === 'opportunities' ? 'Find your next opening' : 'Talk it through'}
              </h2>
            </div>
            {hasSavedProfile && <div className="rounded-full border border-[#ccd8ce] bg-[#e5eee6] px-3 py-1.5 text-[11px] text-[#315c4f]" data-testid="status-profile-ready"><Check size={12} className="mr-1.5 inline" />Profile ready</div>}
          </div>

          {view === 'profile' && (
            <div className="fade-up grid items-start gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(250px,.65fr)]">
              <form onSubmit={handleSaveProfile} className="surface rounded-[22px] border border-border/80 p-5 sm:p-7">
                <div className="mb-7 flex items-start justify-between gap-4">
                  <div>
                    <h3 className="display text-[19px] font-semibold tracking-[-.03em]">A little context goes a long way</h3>
                    <p className="mt-1.5 text-[12px] leading-5 text-muted-foreground">Your details stay tied to this browser profile.</p>
                  </div>
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#e8eee8] text-primary"><FileUser size={19} /></span>
                </div>

                {profileQuery.isLoading && <div className="mb-5 h-10 animate-pulse rounded-lg bg-muted" aria-label="Loading profile" />}
                {profileQuery.isError && (
                  <div className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-[#e8cbc5] bg-[#fbefeb] px-4 py-3 text-[12px] text-[#8e453c]" role="alert" data-testid="error-profile-load">
                    <span>We couldn’t load a saved profile. You can still enter your details and save again.</span>
                    <button type="button" onClick={() => profileQuery.refetch()} className="shrink-0 font-semibold underline underline-offset-2" data-testid="button-retry-profile">Retry</button>
                  </div>
                )}

                <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
                  <Field label="Age" note="In years">
                    <input type="number" min={16} max={100} required value={draft.age} onChange={(event) => updateDraft('age', Number(event.target.value))} className="field-input" data-testid="input-age" />
                  </Field>
                  <Field label="Category">
                    <div className="select-wrap"><select value={draft.category} onChange={(event) => updateDraft('category', event.target.value as ProfileInput['category'])} className="field-input appearance-none" data-testid="select-category">
                      <option value="GENERAL">General</option><option value="OBC">OBC</option><option value="SC">SC</option><option value="ST">ST</option><option value="EWS">EWS</option><option value="OTHER">Other</option>
                    </select><ChevronDown size={15} /></div>
                  </Field>
                  <Field label="Highest qualification">
                    <div className="select-wrap"><select value={draft.degree} onChange={(event) => updateDraft('degree', event.target.value as ProfileInput['degree'])} className="field-input appearance-none" data-testid="select-degree">
                      <option value="SECONDARY">Secondary</option><option value="DIPLOMA">Diploma</option><option value="BACHELOR">Bachelor’s</option><option value="MASTER">Master’s</option><option value="DOCTORATE">Doctorate</option>
                    </select><ChevronDown size={15} /></div>
                  </Field>
                  <Field label="Degree branch" note="For example, Commerce or Mechanical">
                    <input type="text" required minLength={1} maxLength={120} value={draft.branch} onChange={(event) => updateDraft('branch', event.target.value)} placeholder="Your field of study" className="field-input" data-testid="input-branch" />
                  </Field>
                  <Field label="Skills you have" note="Separate each skill with a comma" className="sm:col-span-2">
                    <input type="text" value={skillsText} onChange={(event) => { setSkillsText(event.target.value); setIsDirty(true); }} placeholder="Communication, Excel, Python…" className="field-input" data-testid="input-skills" />
                  </Field>
                  <Field label="Time available to prepare" note="Hours each day" className="sm:col-span-2">
                    <div className="flex items-center gap-4">
                      <input type="range" min="0" max="16" step="0.5" value={draft.dailyHours} onChange={(event) => updateDraft('dailyHours', Number(event.target.value))} className="w-full accent-primary" data-testid="input-daily-hours" />
                      <span className="mono min-w-[72px] rounded-lg bg-[#e8eee8] px-3 py-2 text-center text-[12px] text-primary" data-testid="text-daily-hours">{draft.dailyHours} hrs/day</span>
                    </div>
                  </Field>
                </div>

                {saveProfile.isError && <p className="mt-5 rounded-lg bg-[#fbefeb] px-3 py-2 text-[12px] text-[#8e453c]" role="alert" data-testid="error-save-profile">We couldn’t save your profile. Check your connection and try again.</p>}
                {saveProfile.isSuccess && !isDirty && <p className="mt-5 flex items-center gap-2 text-[12px] text-primary" role="status" data-testid="status-profile-saved"><CheckCircle2 size={15} />Your profile is up to date.</p>}
                <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
                  <p className="max-w-[250px] text-[11px] leading-4 text-muted-foreground">Only the details needed to compare opportunities are requested.</p>
                  <button type="submit" disabled={saveProfile.isPending} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-[12px] font-semibold text-primary-foreground transition-all hover:-translate-y-0.5 hover:shadow-md disabled:cursor-wait disabled:opacity-60" data-testid="button-save-profile">
                    {saveProfile.isPending ? <><LoaderCircle size={15} className="animate-spin" />Saving profile</> : <>Save profile <ArrowRight size={15} /></>}
                  </button>
                </div>
              </form>

              <div className="space-y-4">
                <div className="quiet-grid relative overflow-hidden rounded-[22px] bg-[#285749] p-6 text-[#f3f0e4] sm:p-7">
                  <div className="absolute -right-8 -top-8 h-36 w-36 rounded-full border border-[#f2e9d0]/20" />
                  <div className="absolute -right-1 top-0 h-24 w-24 rounded-full border border-[#f2e9d0]/20" />
                  <div className="relative">
                    <span className="mono inline-flex items-center gap-2 rounded-full border border-white/20 px-2.5 py-1 text-[9px] uppercase tracking-[.18em] text-[#e9d6a6]"><Sparkles size={12} />Your starting point</span>
                    <h3 className="display mt-5 max-w-[250px] text-[24px] font-semibold leading-[1.13] tracking-[-.04em]">Clarity before commitment.</h3>
                    <p className="mt-3 max-w-[270px] text-[12px] leading-5 text-[#d8e1d9]">We compare your profile with published requirements, then help you focus on practical next steps.</p>
                    <button type="button" onClick={() => setView('opportunities')} className="mt-6 inline-flex items-center gap-2 text-[12px] font-semibold text-[#f2d27f] transition-transform hover:translate-x-1" data-testid="button-explore-opportunities">Explore opportunities <ArrowRight size={14} /></button>
                  </div>
                </div>
                <div className="rounded-[20px] border border-[#dedbce] bg-[#f0eee5] p-5">
                  <div className="flex items-center gap-2"><Clock3 size={15} className="text-primary" /><p className="display text-[13px] font-semibold">Small steps count</p></div>
                  <p className="mt-2 text-[12px] leading-[1.65] text-muted-foreground">Your daily preparation time helps the assistant keep advice practical for your routine.</p>
                </div>
                {profileQuery.data?.updatedAt && <p className="px-1 text-[10px] text-muted-foreground" data-testid="text-profile-updated">Last saved {formatDate(profileQuery.data.updatedAt)}</p>}
              </div>
            </div>
          )}

          {view === 'opportunities' && (
            <div className="fade-up">
              {!hasSavedProfile && <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e8d7ad] bg-[#f8f0d9] px-4 py-3 text-[12px] text-[#66542e]" data-testid="notice-profile-required"><span>Save your profile to check eligibility and get a tailored match.</span><button type="button" onClick={() => setView('profile')} className="font-semibold underline underline-offset-2" data-testid="button-go-profile">Set up profile</button></div>}
              <div className="mb-5 flex flex-col gap-3 sm:flex-row">
                <label className="relative flex-1">
                  <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by role, degree, branch or skill" className="field-input !pl-10" aria-label="Search opportunities" data-testid="input-search-opportunities" />
                </label>
                <div className="flex rounded-xl border border-border bg-card p-1">
                  {(['ALL', 'GOVERNMENT', 'PRIVATE'] as const).map((domain) => (
                    <button type="button" key={domain} onClick={() => setDomainFilter(domain)} className={`rounded-lg px-3 py-2 text-[10px] font-semibold transition-colors ${domainFilter === domain ? 'bg-[#dfe9df] text-primary' : 'text-muted-foreground hover:text-foreground'}`} data-testid={`filter-${domain.toLowerCase()}`}>
                      {domain === 'ALL' ? 'All' : domain === 'GOVERNMENT' ? 'Government' : 'Private'}
                    </button>
                  ))}
                </div>
              </div>
              {opportunitiesQuery.isLoading && <div className="grid gap-4">{[0, 1, 2].map((index) => <div key={index} className="h-44 animate-pulse rounded-[20px] border border-border bg-card" />)}</div>}
              {opportunitiesQuery.isError && <div className="surface rounded-[20px] border border-[#e8cbc5] p-7 text-center" role="alert" data-testid="error-opportunities"><p className="display font-semibold">We couldn’t load opportunities.</p><p className="mt-2 text-[12px] text-muted-foreground">Try again in a moment.</p><button type="button" onClick={() => opportunitiesQuery.refetch()} className="mt-4 rounded-lg bg-primary px-4 py-2 text-[12px] font-semibold text-primary-foreground" data-testid="button-retry-opportunities">Retry</button></div>}
              {!opportunitiesQuery.isLoading && !opportunitiesQuery.isError && opportunities.length === 0 && <div className="surface rounded-[20px] border border-border p-10 text-center" data-testid="empty-opportunities"><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-muted text-primary"><BriefcaseBusiness size={20} /></span><p className="display mt-4 font-semibold">No opportunities listed right now.</p><p className="mt-2 text-[12px] text-muted-foreground">Check back later for new options to explore.</p></div>}
              {!opportunitiesQuery.isLoading && !opportunitiesQuery.isError && opportunities.length > 0 && filteredOpportunities.length === 0 && <div className="surface rounded-[20px] border border-border p-8 text-center" data-testid="empty-search-results"><p className="display font-semibold">Nothing matches that search.</p><p className="mt-2 text-[12px] text-muted-foreground">Try a different term or broaden the domain filter.</p><button type="button" onClick={() => { setQuery(''); setDomainFilter('ALL'); }} className="mt-3 text-[12px] font-semibold text-primary underline underline-offset-2" data-testid="button-clear-filters">Clear filters</button></div>}
              <div className="space-y-4">
                {filteredOpportunities.map((opportunity, index) => (
                  <OpportunityCard
                    key={opportunity.id}
                    opportunity={opportunity}
                    index={index}
                    eligibility={eligibilityById[opportunity.id]}
                    match={matchesById[opportunity.id]}
                    eligibilityPending={checkEligibility.isPending && checkEligibility.variables?.data.opportunityId === opportunity.id}
                    matchPending={getAiMatch.isPending && getAiMatch.variables?.data.opportunityId === opportunity.id}
                    eligibilityError={checkEligibility.isError && checkEligibility.variables?.data.opportunityId === opportunity.id}
                    matchError={getAiMatch.isError && getAiMatch.variables?.data.opportunityId === opportunity.id}
                    canCheck={hasSavedProfile}
                    onCheck={() => runEligibility(opportunity)}
                    onMatch={() => runMatch(opportunity)}
                    onAsk={() => openAssistant(opportunity.id)}
                  />
                ))}
              </div>
              {!opportunitiesQuery.isLoading && opportunities.length > 0 && <p className="mt-5 text-center text-[10px] leading-4 text-muted-foreground">Requirements can change. Confirm age, category, qualification and deadlines in the official notice before applying.</p>}
            </div>
          )}

          {view === 'assistant' && (
            <div className="fade-up grid items-start gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(250px,.65fr)]">
              <div className="surface flex min-h-[520px] flex-col overflow-hidden rounded-[22px] border border-border/80">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-[#f2f1e8] px-5 py-4">
                  <div className="flex items-center gap-3">
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground"><MessageCircle size={17} /></span>
                    <div><p className="display text-[13px] font-semibold">Career assistant</p><p className="text-[10px] text-muted-foreground">{activeOpportunity ? `Context: ${activeOpportunity.title}` : 'Choose an opportunity for context'}</p></div>
                  </div>
                  <div className="relative min-w-[190px]">
                    <select value={activeOpportunityId} onChange={(event) => setActiveOpportunityId(event.target.value)} className="w-full appearance-none rounded-lg border border-border bg-card py-2 pl-3 pr-8 text-[11px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25" aria-label="Choose opportunity for chat" data-testid="select-chat-opportunity">
                      <option value="">Select opportunity</option>
                      {opportunities.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
                    </select><ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  </div>
                </div>
                <div className="flex-1 space-y-4 overflow-y-auto px-5 py-6 sm:px-7">
                  <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-[#e8eee8] px-4 py-3 text-[12px] leading-[1.7] text-[#324f45]">
                    I can help you think through requirements and practical preparation. What would you like to understand?
                    <p className="mt-2 text-[9px] text-[#71857a]">Advice is informational; verify details with official sources.</p>
                  </div>
                  {!activeOpportunity && <div className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-[11px] text-muted-foreground" data-testid="notice-chat-select">Choose an opportunity above to ground this conversation in its requirements.</div>}
                  {activeOpportunity && !hasSavedProfile && <div className="rounded-xl bg-[#f8f0d9] px-4 py-3 text-[11px] text-[#66542e]" data-testid="notice-chat-profile">Save your profile before asking for personalized advice. <button type="button" onClick={() => setView('profile')} className="font-semibold underline underline-offset-2" data-testid="button-chat-profile">Set it up</button></div>}
                  {selectedTurns.map((turn, index) => (
                    <div key={`${index}-${turn.role}`} className={`max-w-[88%] rounded-2xl px-4 py-3 text-[12px] leading-[1.7] ${turn.role === 'user' ? 'ml-auto rounded-tr-sm bg-primary text-primary-foreground' : 'rounded-tl-sm bg-[#e8eee8] text-[#324f45]'}`} data-testid={`chat-turn-${index}`}>
                      {turn.content}
                    </div>
                  ))}
                  {sendAiChat.isPending && <div className="flex w-fit items-center gap-2 rounded-2xl rounded-tl-sm bg-[#e8eee8] px-4 py-3 text-[11px] text-[#526a60]" role="status" data-testid="status-chat-pending"><span className="flex gap-1"><i className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" /><i className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary [animation-delay:120ms]" /><i className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary [animation-delay:240ms]" /></span>Thinking through your question</div>}
                  {chatError && <p className="rounded-lg bg-[#fbefeb] px-3 py-2 text-[11px] text-[#8e453c]" role="alert" data-testid="error-chat">{chatError}</p>}
                </div>
                <form onSubmit={submitChat} className="border-t border-border bg-[#f5f3ea] p-4 sm:p-5">
                  <label htmlFor="chat-message" className="sr-only">Ask a career question</label>
                  <div className="flex items-end gap-2 rounded-xl border border-border bg-card p-2 pl-3 focus-within:ring-2 focus-within:ring-primary/20">
                    <textarea id="chat-message" rows={2} maxLength={2000} value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder={hasSavedProfile ? 'Ask about requirements or a next step…' : 'Save your profile to start a conversation'} disabled={!hasSavedProfile || !activeOpportunity} className="max-h-28 min-h-[42px] flex-1 resize-y bg-transparent py-2 text-[12px] outline-none placeholder:text-muted-foreground/75 disabled:cursor-not-allowed" data-testid="input-chat-message" />
                    <button type="submit" disabled={!chatInput.trim() || !activeOpportunity || !hasSavedProfile || sendAiChat.isPending} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Send message" data-testid="button-send-chat">{sendAiChat.isPending ? <LoaderCircle size={15} className="animate-spin" /> : <Send size={15} />}</button>
                  </div>
                  <div className="mt-2 flex justify-between px-1 text-[9px] text-muted-foreground"><span>Keep questions focused and practical.</span><span>{chatInput.length}/2000</span></div>
                </form>
              </div>
              <div className="space-y-4">
                <div className="rounded-[22px] bg-[#e9e5d7] p-5 sm:p-6">
                  <p className="mono text-[9px] uppercase tracking-[.18em] text-primary">Good questions to start with</p>
                  <div className="mt-4 space-y-2">
                    {['Which requirement should I check first?', 'What can I work on with my available time?', 'How should I read the skill gaps?'].map((starter) => (
                      <button key={starter} type="button" onClick={() => setChatInput(starter)} className="flex w-full items-center justify-between rounded-xl border border-[#d7d3c3] bg-[#f5f2e8] px-3 py-3 text-left text-[11px] text-[#40574f] transition-colors hover:border-primary/40 hover:bg-card" data-testid={`button-prompt-${starter.slice(0, 8).toLowerCase().replace(/\s/g, '-')}`}>
                        {starter}<ArrowUpRight size={13} className="ml-2 shrink-0 text-primary" />
                      </button>
                    ))}
                  </div>
                </div>
                <div className="rounded-[20px] border border-[#dedbce] bg-[#f0eee5] p-5">
                  <div className="flex items-center gap-2 text-primary"><BookOpen size={15} /><p className="display text-[13px] font-semibold">Grounded, not guaranteed</p></div>
                  <p className="mt-2 text-[12px] leading-[1.65] text-muted-foreground">Assistant replies are based on your profile and selected opportunity. They aren’t official eligibility decisions or a substitute for the latest notification.</p>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>
      <footer className="border-t border-border/70 bg-[#f1eee3]">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-2 px-5 py-5 text-[10px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-12">
          <span className="mono uppercase tracking-[.12em]">CareerCompass AI · Made for the next step</span>
          <span>Always verify requirements and dates with the official source.</span>
        </div>
      </footer>
    </div>
  );
}

function Field({ label, note, className = '', children }: { label: string; note?: string; className?: string; children: React.ReactNode }) {
  return <label className={`block ${className}`}><span className="mb-1.5 flex items-baseline justify-between gap-2 text-[11px] font-semibold text-foreground">{label}{note && <small className="text-[9px] font-normal text-muted-foreground">{note}</small>}</span>{children}</label>;
}

function OpportunityCard({
  opportunity, index, eligibility, match, eligibilityPending, matchPending, eligibilityError, matchError, canCheck, onCheck, onMatch, onAsk,
}: {
  opportunity: Opportunity;
  index: number;
  eligibility?: EligibilityResult;
  match?: AiMatchResponse;
  eligibilityPending: boolean;
  matchPending: boolean;
  eligibilityError: boolean;
  matchError: boolean;
  canCheck: boolean;
  onCheck: () => void;
  onMatch: () => void;
  onAsk: () => void;
}) {
  const statusMeta = eligibility ? getStatusMeta(eligibility.status) : null;
  return (
    <article className="surface overflow-hidden rounded-[20px] border border-border/80 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#b9c9bb] hover:shadow-[0_18px_38px_rgba(37,63,55,.1)]" data-testid={`card-opportunity-${opportunity.id}`}>
      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[.1em] ${opportunity.domain === 'GOVERNMENT' ? 'bg-[#dfe9df] text-[#315d50]' : 'bg-[#f3e7cc] text-[#765c26]'}`} data-testid={`badge-domain-${opportunity.id}`}>{opportunity.domain === 'GOVERNMENT' ? 'Government' : 'Private'}</span>
              <span className="mono text-[9px] text-muted-foreground">UPDATED {formatDate(opportunity.lastUpdated)}</span>
            </div>
            <h3 className="display text-[19px] font-semibold leading-snug tracking-[-.035em] sm:text-[21px]" data-testid={`text-opportunity-title-${opportunity.id}`}>{opportunity.title}</h3>
          </div>
          {statusMeta && <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[10px] font-semibold ${statusMeta.className}`} data-testid={`status-eligibility-${opportunity.id}`}><statusMeta.Icon size={13} />{statusMeta.label}</span>}
        </div>

        <div className="mt-4 grid gap-3 border-y border-border/80 py-4 sm:grid-cols-3">
          <Requirement label="Age" value={`${opportunity.minAge}${opportunity.maxAge === null ? '+' : `–${opportunity.maxAge}`} years`} />
          <Requirement label="Minimum degree" value={formatEnum(opportunity.minDegree)} />
          <Requirement label="Allowed branches" value={opportunity.allowedBranches.length ? opportunity.allowedBranches.join(', ') : 'See official notice'} />
        </div>
        {opportunity.requiredSkills.length > 0 && <div className="mt-4"><p className="mono mb-2 text-[9px] uppercase tracking-[.14em] text-muted-foreground">Skills mentioned</p><div className="flex flex-wrap gap-1.5">{opportunity.requiredSkills.map((skill) => <span key={skill} className="rounded-md border border-[#d9dfd7] bg-[#edf1e9] px-2 py-1 text-[10px] text-[#4c6557]">{skill}</span>)}</div></div>}

        {eligibility && <div className="mt-4 rounded-xl bg-[#f1f0e8] p-4" data-testid={`result-eligibility-${opportunity.id}`}>
          <p className="display text-[12px] font-semibold">Eligibility check</p>
          {eligibility.reasons.length ? <ul className="mt-2 space-y-1.5">{eligibility.reasons.map((reason, reasonIndex) => <li key={`${reason}-${reasonIndex}`} className="flex gap-2 text-[11px] leading-[1.55] text-muted-foreground"><span className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-primary" />{reason}</li>)}</ul> : <p className="mt-2 text-[11px] text-muted-foreground">No additional details were returned.</p>}
        </div>}

        {match && <div className="mt-4 rounded-xl border border-[#d7dfd2] bg-[#eef2e9] p-4" data-testid={`result-ai-match-${opportunity.id}`}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <div className="relative grid h-[52px] w-[52px] shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(hsl(var(--primary)) ${Math.max(0, Math.min(100, match.matchPercentage))}%, #d5ddd2 0)` }}>
              <span className="grid h-[42px] w-[42px] place-items-center rounded-full bg-[#eef2e9]"><strong className="mono text-[13px] text-primary">{match.matchPercentage}<small className="text-[8px]">%</small></strong></span>
            </div>
            <div className="min-w-[180px] flex-1"><p className="mono text-[9px] uppercase tracking-[.15em] text-primary">Profile match</p><p className="mt-1 text-[11px] leading-[1.55] text-[#53665a]" data-testid={`text-match-summary-${opportunity.id}`}>{match.summary}</p></div>
          </div>
          {match.top3Gaps.length > 0 && <div className="mt-4 border-t border-[#d5ddd2] pt-3"><p className="mono mb-2 text-[9px] uppercase tracking-[.14em] text-muted-foreground">Areas to build</p><ul className="space-y-1.5">{match.top3Gaps.map((gap, gapIndex) => <li key={`${gap}-${gapIndex}`} className="flex items-start gap-2 text-[11px] text-[#53665a]"><ArrowDownRight size={13} className="mt-0.5 shrink-0 text-primary" />{gap}</li>)}</ul></div>}
        </div>}

        {eligibilityError && <p className="mt-3 text-[11px] text-[#9b4d43]" role="alert" data-testid={`error-eligibility-${opportunity.id}`}>We couldn’t complete this check. Please try again.</p>}
        {matchError && <p className="mt-3 text-[11px] text-[#9b4d43]" role="alert" data-testid={`error-match-${opportunity.id}`}>The match summary is unavailable right now. Please try again.</p>}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button type="button" onClick={onCheck} disabled={!canCheck || eligibilityPending} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2.5 text-[10px] font-semibold text-primary-foreground transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45" data-testid={`button-check-${opportunity.id}`}>{eligibilityPending ? <LoaderCircle size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}{eligibilityPending ? 'Checking' : 'Check eligibility'}</button>
          <button type="button" onClick={onMatch} disabled={!canCheck || matchPending} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 py-2.5 text-[10px] font-semibold text-foreground transition-colors hover:border-primary/40 hover:bg-[#eef1e8] disabled:cursor-not-allowed disabled:opacity-45" data-testid={`button-match-${opportunity.id}`}>{matchPending ? <LoaderCircle size={13} className="animate-spin" /> : <Sparkles size={13} />}{matchPending ? 'Finding match' : 'Get AI match'}</button>
          <button type="button" onClick={onAsk} className="ml-auto inline-flex items-center gap-1.5 px-2 py-2 text-[10px] font-semibold text-primary hover:underline hover:underline-offset-4" data-testid={`button-ask-${opportunity.id}`}>Ask assistant <ArrowRight size={13} /></button>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-3">
          <span className="flex items-center gap-1.5 text-[9px] text-muted-foreground"><ShieldCheck size={12} />Informational only — verify before applying</span>
          <a href={opportunity.officialUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-primary hover:underline hover:underline-offset-4" data-testid={`link-official-${opportunity.id}`}>Official source <ExternalLink size={12} /></a>
        </div>
      </div>
      <div className="h-[3px] bg-gradient-to-r from-primary/70 via-[#d8b35e] to-transparent" aria-hidden="true" style={{ opacity: 0.65 + (index % 3) * 0.1 }} />
    </article>
  );
}

function Requirement({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><p className="mono mb-1 text-[9px] uppercase tracking-[.13em] text-muted-foreground">{label}</p><p className="text-[11px] leading-[1.5] text-foreground">{value}</p></div>;
}

function getStatusMeta(status: EligibilityResult['status']) {
  if (status === 'ELIGIBLE') return { label: 'Eligible', className: 'bg-[#dcebe0] text-[#285c43]', Icon: CheckCircle2 };
  if (status === 'POSSIBLY_ELIGIBLE') return { label: 'Possibly eligible', className: 'bg-[#f5edcf] text-[#806426]', Icon: CircleHelp };
  return { label: 'Not eligible', className: 'bg-[#f4e2dc] text-[#91483d]', Icon: ArrowDownRight };
}

function formatEnum(value: string) {
  return value.toLowerCase().split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

function App() {
  return <QueryClientProvider client={queryClient}><AppContent /></QueryClientProvider>;
}

export default App;
