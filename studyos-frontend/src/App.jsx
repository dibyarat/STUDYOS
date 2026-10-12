import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useAuth } from './auth/useAuth.js'
import { apiRequest, apiUpload, resolveEndpoint } from './lib/api.js'
import { discussionApi } from './lib/discussions.js'
import { trackPageView, trackEvent } from './lib/analytics.js'
import {
  ArrowRight,
  Bell,
  BriefcaseBusiness,
  BookOpen,
  Bookmark,
  ChevronDown,
  ChevronUp,
  Clock3,
  Download,
  FileText,
  FolderKanban,
  GraduationCap,
  LayoutDashboard,
  Library,
  Menu,
  MessageSquare,
  Plus,
  Pencil,
  Search,
  Send,
  Settings,
  Sparkles,
  Star,
  Trash2,
  UsersRound,
  X,
  ExternalLink,
  Code2,
  LogOut,
} from 'lucide-react'
import './StudyOS.css'
import './StudyOS-layout.css'
import './StudyOS-interactions.css'
import './StudyOS-team.css'
import './StudyOS-workflows.css'
import './StudyOS-marketplace.css'
import './StudyOS-owner-actions.css'
import './StudyOS-auth-fix.css'
import './StudyOS-notifications.css'
import './StudyOS-classes.css'
import './StudyOS-skills.css'
import './StudyOS-search.css'
import './StudyOS-messages.css'
import './StudyOS-projects.css'
import './StudyOS-final.css'
import './StudyOS-polish.css'
import AcademicOnboardingModal from './auth/AcademicOnboardingModal.jsx'
import FileViewerModal from './components/FileViewerModal.jsx'
import studyosMark from './assets/studyos-mark.png'
import campassistIcon from './assets/campassist-icon.png'

const navItems = [
  { label: 'Dashboard', icon: LayoutDashboard, key: 'dashboard' },
  { label: 'Virtual Study Classes', icon: BookOpen, key: 'classes' },
  { label: 'Study Notes Vault', icon: Library, key: 'vault' },
  { label: 'Projects & Lab Repository', icon: FolderKanban, key: 'projects' },
  { label: 'Team Finder', icon: UsersRound, key: 'teams' },
  { label: 'Skills & Help', icon: Sparkles, key: 'skills' },
]

const normalizeResource = (resource) => ({
  ...resource,
  creatorName: resource.creator?.name || 'Student',
  subjectLabel: resource.subject || 'General',
  tags: resource.tags?.map((tag) => (typeof tag === 'string' ? tag : tag.tag)).filter(Boolean) || [],
  averageRating: resource.averageRating ?? (resource.ratings?.length ? resource.ratings.reduce((total, item) => total + (item.rating || 0), 0) / resource.ratings.length : 0),
  ratingCount: resource.ratingCount ?? resource.ratings?.length ?? resource._count?.ratings ?? 0,
  saveCount: resource.saveCount ?? resource._count?.saves ?? resource.saves?.length ?? 0,
  savedByUser: Boolean(resource.savedByUser ?? false),
})

const normalizeTeamPost = (post) => ({
  ...post,
  creatorName: post.creator?.name || 'Student',
  skills: post.skills || post.reqSkills || '',
  size: post.size ?? post.teamSize ?? 2,
  members: post.members ?? post.memberships?.length ?? 1,
})

const normalizeHelpService = (job) => ({
  ...job,
  skill: job.skill || job.category || 'General help',
  budget: job.isPaid ? (job.price ? `₹${job.price}` : 'Paid') : 'Free',
  categoryLabel: String(job.category || 'OTHER').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()),
  status: job.status || 'OPEN',
})

const normalizeStudyClass = (studyClass) => ({
  ...studyClass,
  title: studyClass.name || studyClass.title,
  topicCount: studyClass.topics?.length || 0,
  resourceCount: studyClass.topics?.reduce((count, topic) => count + (topic.resources?.length || 0), 0) || 0,
  progress: studyClass.progress || 0,
  color: studyClass.color || 'blue',
})

const normalizeProject = (project) => ({
  ...project,
  creatorName: project.creator?.name || 'Student',
  tags: project.tags?.map((t) => (typeof t === 'string' ? t : t.tag)).filter(Boolean) || [],
  categoryLabel: String(project.category || 'OTHER').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()),
})

function App() {
  const { user, profile, session, signOut, resendVerification, reloadProfile } = useAuth()
  const [activePage, setActivePage] = useState('dashboard')
  const [showOnboardingModal, setShowOnboardingModal] = useState(false)
  const onboardingCheckedRef = useRef(false)

  useEffect(() => {
    if (activePage) {
      trackPageView(activePage)
    }
  }, [activePage])

  useEffect(() => {
    if (user && profile && !onboardingCheckedRef.current) {
      onboardingCheckedRef.current = true
      const isCompletedOrDismissed = Boolean(
        localStorage.getItem(`studyos_onboarding_completed_${user.id}`) ||
        localStorage.getItem(`studyos_onboarding_dismissed_${user.id}`) ||
        profile.onboardingCompleted ||
        profile.academicIdentity?.onboardingCompleted ||
        profile.profile?.onboardingCompleted
      )
      if (isCompletedOrDismissed) {
        return
      }

      const hasSection = Boolean(
        profile.academicIdentity?.section ||
        profile.profile?.section ||
        profile.section ||
        profile.student?.section?.name
      )
      const hasDept = Boolean(
        profile.academicIdentity?.branch ||
        profile.academicIdentity?.department ||
        profile.profile?.department ||
        profile.department ||
        profile.student?.section?.department?.name
      )
      if (!hasSection || !hasDept) {
        setShowOnboardingModal(true)
      }
    }
  }, [user, profile])

  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [resendingVerification, setResendingVerification] = useState(false)
  const [verificationCooldown, setVerificationCooldown] = useState(0)
  const [search, setSearch] = useState('')
  const [vaultSearch, setVaultSearch] = useState('')
  const [searchResults, setSearchResults] = useState(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [selectedPublicProfileId, setSelectedPublicProfileId] = useState(null)
  const [selectedConversationId, setSelectedConversationId] = useState(null)
  const [showResourceModal, setShowResourceModal] = useState(false)
  const [showClassModal, setShowClassModal] = useState(false)
  const [editingClass, setEditingClass] = useState(null)
  const [publishDialog, setPublishDialog] = useState(null)
  const [publishMode, setPublishMode] = useState('CLASS')
  const [publishPaid, setPublishPaid] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState('')
  const [editingResource, setEditingResource] = useState(null)
  const [resourceEditPaid, setResourceEditPaid] = useState(false)
  const [savingResourceEdit, setSavingResourceEdit] = useState(false)
  const [resourceSaving, setResourceSaving] = useState(false)
  const [resourceSaveError, setResourceSaveError] = useState('')
  const [classSaving, setClassSaving] = useState(false)
  const [classResourceSaving, setClassResourceSaving] = useState(false)
  const [classResourceError, setClassResourceError] = useState('')
  const [classResourceFileName, setClassResourceFileName] = useState('')
  const [teamSaving, setTeamSaving] = useState(false)
  const [helpSaving, setHelpSaving] = useState(false)
  const [topicDialog, setTopicDialog] = useState(null)
  const [resourceDialog, setResourceDialog] = useState(null)
  const [resourceKind, setResourceKind] = useState('RESOURCE')
  const [expandedClassId, setExpandedClassId] = useState(null)
  const [showTeamModal, setShowTeamModal] = useState(false)
  const [editingTeam, setEditingTeam] = useState(null)
  const [teamRequestsDialog, setTeamRequestsDialog] = useState(null)
  const [teamReviewNotice, setTeamReviewNotice] = useState(null)
  const [decidingRequestId, setDecidingRequestId] = useState(null)
  const [activePreviewFile, setActivePreviewFile] = useState(null)
  const [myApplications, setMyApplications] = useState([])
  const [myApplicationsLoading, setMyApplicationsLoading] = useState(false)
  const [myApplicationsOpen, setMyApplicationsOpen] = useState(false)
  const [teamApplicationDialog, setTeamApplicationDialog] = useState(null)
  const [helpRequestDialog, setHelpRequestDialog] = useState(null)
  const [helpReviewDialog, setHelpReviewDialog] = useState(null)
  const [updatingHelpRequestId, setUpdatingHelpRequestId] = useState(null)
  const [showJobModal, setShowJobModal] = useState(false)
  const [resources, setResources] = useState([])
  const [classes, setClasses] = useState([])
  const [teamPosts, setTeamPosts] = useState([])
  const [jobs, setJobs] = useState([])
  const [teamPostCount, setTeamPostCount] = useState(0)
  const [helpServiceCount, setHelpServiceCount] = useState(0)
  const [skills, setSkills] = useState([])
  const [helpRequests, setHelpRequests] = useState([])
  const [projects, setProjects] = useState([])
  const [labs, setLabs] = useState([])
  const [showProjectModal, setShowProjectModal] = useState(false)
  const [editingProject, setEditingProject] = useState(null)
  const [projectSaving, setProjectSaving] = useState(false)
  const [showLabModal, setShowLabModal] = useState(false)
  const [editingLab, setEditingLab] = useState(null)
  const [labSaving, setLabSaving] = useState(false)
  const [labUploadProgress, setLabUploadProgress] = useState(0)
  const [dataLoadError, setDataLoadError] = useState('')
  const [resourcesError, setResourcesError] = useState('')
  const [classesError, setClassesError] = useState('')
  const [summaryError, setSummaryError] = useState('')
  const [notificationsError, setNotificationsError] = useState('')
  const [sessionExpired, setSessionExpired] = useState(false)
  const [retryingSection, setRetryingSection] = useState('')
  const [reportDialog, setReportDialog] = useState(null)
  const [reportSaving, setReportSaving] = useState(false)
  const [reportError, setReportError] = useState('')
  const [rateDialog, setRateDialog] = useState(null)
  const [rateSaving, setRateSaving] = useState(false)
  const [rateError, setRateError] = useState('')
  const [detailResource, setDetailResource] = useState(null)
  const [actionNotice, setActionNotice] = useState('')
  const [initialLoading, setInitialLoading] = useState(true)
  const [editingJob, setEditingJob] = useState(null)
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const initialDataUser = useRef(null)
  const skillsDataUser = useRef(null)
  const teamDataUser = useRef(null)
  const projectsDataUser = useRef(null)
  const classResourceSavingRef = useRef(false)
  const searchInputRef = useRef(null)
  const notificationControlRef = useRef(null)

  useEffect(() => {
    if (!user?.id || !session?.access_token || initialDataUser.current === user.id) return undefined

    const userId = user.id
    initialDataUser.current = userId
    skillsDataUser.current = null
    teamDataUser.current = null
    projectsDataUser.current = null
    setResources([])
    setClasses([])
    setTeamPosts([])
    setJobs([])
    setProjects([])
    setLabs([])
    setTeamPostCount(0)
    setHelpServiceCount(0)
    setSkills([])
    setHelpRequests([])
    setNotifications([])
    setUnreadCount(0)
    setDataLoadError('')
    setResourcesError('')
    setClassesError('')
    setSummaryError('')
    setNotificationsError('')
    setSessionExpired(false)
    setInitialLoading(true)
    let active = true
    let completed = false
    const token = session.access_token
    const controller = new AbortController()

    const loadSection = (label, path, apply, setError) => apiRequest(path, { token, signal: controller.signal })
      .then((data) => {
        if (active) apply(data)
        return 'loaded'
      })
      .catch((error) => {
        if (error.name === 'AbortError') return 'aborted'
        console.error(`Failed to load ${label}:`, error)
        if (active) setError(`Could not load ${label}.`)
        return 'failed'
      })

    Promise.all([
      loadSection('Vault resources', '/resources', (data) => setResources((data.resources || []).map(normalizeResource)), setResourcesError),
      loadSection('Virtual Study Classes', '/classes', (data) => setClasses((data.classes || []).map(normalizeStudyClass)), setClassesError),
      loadSection('dashboard summary', '/dashboard/summary', (data) => {
        setTeamPostCount(data.teamPosts || 0)
        setHelpServiceCount(data.helpServices || 0)
      }, setSummaryError),
      loadSection('notifications', '/notifications', (data) => {
        setNotifications(data.notifications || [])
        setUnreadCount(data.unreadCount || 0)
        setNotificationsError('')
        setSessionExpired(false)
      }, setNotificationsError),
    ]).then((results) => {
      completed = true
      if (!active) return
      setDataLoadError(results.some((result) => result === 'failed') ? 'Some workspace data could not be loaded.' : '')
      setInitialLoading(false)
    })

    return () => {
      active = false
      controller.abort()
      if (!completed) initialDataUser.current = null
    }
  }, [user?.id, session?.access_token])

  useEffect(() => {
    if (activePage !== 'teams' || !user?.id || !session?.access_token || teamDataUser.current === user.id) return undefined
    const userId = user.id
    teamDataUser.current = userId
    let active = true
    let completed = false
    const token = session.access_token
    const controller = new AbortController()
    apiRequest('/teams', { token, signal: controller.signal })
      .then((data) => {
        if (!active) return
        completed = true
        const loaded = (data.teamPosts || []).map(normalizeTeamPost)
        setTeamPosts(loaded)
        setTeamPostCount(loaded.length)
        setDataLoadError('')
      })
      .catch((error) => {
        if (error.name === 'AbortError') return
        console.error('Failed to load Team Finder:', error)
        if (active) {
          teamDataUser.current = null
          setDataLoadError('Could not load: Team Finder.')
        }
      })
    return () => {
      active = false
      controller.abort()
      if (!completed) teamDataUser.current = null
    }
  }, [activePage, user?.id, session?.access_token])

  useEffect(() => {
    if (activePage !== 'skills' || !user?.id || !session?.access_token || skillsDataUser.current === user.id) return undefined
    const userId = user.id
    skillsDataUser.current = userId
    let active = true
    let completed = false
    const token = session.access_token
    const controller = new AbortController()
    const errors = []
    const loadSkillsSection = (label, path, apply) => apiRequest(path, { token, signal: controller.signal })
      .then((data) => { if (active) apply(data) })
      .catch((error) => {
        if (error.name === 'AbortError') return
        console.error(`Failed to load ${label}:`, error)
        errors.push(label)
      })
    Promise.all([
      loadSkillsSection('help services', '/help-services', (data) => setJobs((data.jobs || []).map(normalizeHelpService))),
      loadSkillsSection('skills', '/skills', (data) => setSkills(data.skills || [])),
      loadSkillsSection('help requests', '/help-services/requests', (data) => setHelpRequests(data.requests || [])),
    ]).then(() => {
      completed = true
      if (!active) return
      if (errors.length) {
        skillsDataUser.current = null
        setDataLoadError(`Could not load: ${errors.join(', ')}.`)
      } else setDataLoadError('')
    })
    return () => {
      active = false
      controller.abort()
      if (!completed) skillsDataUser.current = null
    }
  }, [activePage, user?.id, session?.access_token])

  useEffect(() => {
    if (activePage !== 'projects' || !user?.id || !session?.access_token || projectsDataUser.current === user.id) return undefined
    const userId = user.id
    projectsDataUser.current = userId
    let active = true
    let completed = false
    const token = session.access_token
    const controller = new AbortController()
    const errors = []
    const loadProjectsSection = (label, path, apply) => apiRequest(path, { token, signal: controller.signal })
      .then((data) => { if (active) apply(data) })
      .catch((error) => {
        if (error.name === 'AbortError') return
        console.error(`Failed to load ${label}:`, error)
        errors.push(label)
      })
    Promise.all([
      loadProjectsSection('projects', '/projects', (data) => setProjects((data.projects || []).map(normalizeProject))),
      loadProjectsSection('lab records', '/projects/labs', (data) => setLabs(data.labs || [])),
    ]).then(() => {
      completed = true
      if (!active) return
      if (errors.length) {
        projectsDataUser.current = null
        setDataLoadError(`Could not load: ${errors.join(', ')}.`)
      } else setDataLoadError('')
    })
    return () => {
      active = false
      controller.abort()
      if (!completed) projectsDataUser.current = null
    }
  }, [activePage, user?.id, session?.access_token])

  useEffect(() => {
    const query = search.trim()
    if (!session?.user?.id || !session?.access_token || !query) return undefined

    let active = true
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setSearchLoading(true)
      setSearchError('')
      try {
        const data = await apiRequest(`/search?q=${encodeURIComponent(query)}&page=1&limit=6`, { token: session.access_token, signal: controller.signal })
        if (active) setSearchResults(data)
      } catch (error) {
        if (active) {
          setSearchResults(null)
          setSearchError(error.message || 'Search is unavailable right now.')
        }
      } finally {
        if (active) setSearchLoading(false)
      }
    }, 350)

    return () => {
      active = false
      clearTimeout(timer)
      controller.abort()
    }
  }, [search, session?.access_token, session?.user?.id])

  useEffect(() => {
    if (!session?.user?.id || !session?.access_token) return undefined
    const refresh = async () => {
      try {
        const data = await apiRequest('/notifications', { token: session.access_token })
        setNotifications(data.notifications || [])
        setUnreadCount(data.unreadCount || 0)
        setNotificationsError('')
      } catch (error) {
        console.error('Failed to refresh notifications:', error)
        if (error.status === 401) {
          setNotifications([])
          setUnreadCount(0)
          setNotificationsError('Your session has expired. Sign out and sign in again to refresh StudyOS data.')
          setSessionExpired(true)
        } else {
          setNotificationsError('Notifications are temporarily unavailable. Your unread count may be out of date.')
        }
      }
    }
    const refreshOnFocus = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    const interval = setInterval(refresh, 30000)
    window.addEventListener('focus', refreshOnFocus)
    document.addEventListener('visibilitychange', refreshOnFocus)
    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', refreshOnFocus)
      document.removeEventListener('visibilitychange', refreshOnFocus)
    }
  }, [session?.user?.id, session?.access_token])

  useEffect(() => {
    const onSessionExpired = () => {
      setNotifications([])
      setUnreadCount(0)
      setNotificationsError('Your session has expired. Sign out and sign in again to refresh StudyOS data.')
      setSessionExpired(true)
    }
    const onDocumentClick = (event) => {
      if (!notificationControlRef.current?.contains(event.target)) setNotificationsOpen(false)
    }
    const onKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchInputRef.current?.focus()
      }
      if (event.key === 'Escape') {
        setNotificationsOpen(false)
        if (document.activeElement === searchInputRef.current) {
          setSearch('')
          searchInputRef.current?.blur()
        }
      }
    }
    window.addEventListener('studyos:session-expired', onSessionExpired)
    document.addEventListener('pointerdown', onDocumentClick)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('studyos:session-expired', onSessionExpired)
      document.removeEventListener('pointerdown', onDocumentClick)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  useEffect(() => {
    if (!actionNotice) return undefined
    const timeout = setTimeout(() => setActionNotice(''), 3500)
    return () => clearTimeout(timeout)
  }, [actionNotice])

  const userName = profile?.profile?.fullName || profile?.name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'Student'
  const userInitials = userName.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()
  const teamUnreadCount = useMemo(
    () => notifications.filter((item) => item.relatedEntityType === 'TEAM' && !item.isRead).length,
    [notifications],
  )

  const filteredResources = useMemo(() => resources.filter((resource) => {
    const searchText = vaultSearch.toLowerCase();
    const title = String(resource.title || '').toLowerCase();
    const subject = String(resource.subject || '').toLowerCase();
    return title.includes(searchText) || subject.includes(searchText);
  }), [resources, vaultSearch])

  const triggerFileDownload = async (fileOrUrl, preferredFileName) => {
    let url = typeof fileOrUrl === 'string' ? fileOrUrl : (fileOrUrl?.downloadUrl || fileOrUrl?.url)
    let fileName = preferredFileName || (typeof fileOrUrl === 'object' ? fileOrUrl?.fileName : null) || 'download'
    let directEndpoint = typeof fileOrUrl === 'object' ? fileOrUrl?.directDownloadUrl : null

    if (!url && !directEndpoint) return

    // Try direct streaming endpoint first if available with auth header
    if (directEndpoint && session?.access_token) {
      try {
        const res = await fetch(directEndpoint, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        if (res.ok) {
          const blob = await res.blob()
          const blobUrl = URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.href = blobUrl
          link.download = fileName
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
          setTimeout(() => URL.revokeObjectURL(blobUrl), 3000)
          return
        }
      } catch (e) {
        console.warn('Authorized direct stream download failed, falling back to delivery URL:', e)
      }
    }

    if (url) {
      try {
        const res = await fetch(url)
        if (res.ok) {
          const blob = await res.blob()
          const blobUrl = URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.href = blobUrl
          link.download = fileName
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
          setTimeout(() => URL.revokeObjectURL(blobUrl), 3000)
          return
        }
      } catch (err) {
        console.warn('Direct blob fetch failed, falling back to anchor download:', err)
      }
      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }
  }

  const openResourceFile = async (resourceId, fileId, fileName, mode = 'preview') => {
    try {
      const result = await apiRequest(`/resources/${resourceId}/files/${fileId}/access`, {
        token: session?.access_token,
      })
      if (!result?.url && !result?.previewUrl) throw new Error('The file service did not provide a download link.')
      const targetFileName = fileName || result.fileName || 'study-resource'
      const filePayload = {
        title: targetFileName,
        fileName: targetFileName,
        url: result.previewUrl || result.url,
        previewUrl: result.previewUrl || result.url,
        downloadUrl: result.downloadUrl || result.url,
        directDownloadUrl: result.directDownloadUrl ? resolveEndpoint(result.directDownloadUrl) : null,
        mimeType: result.mimeType || '',
        fileSize: result.fileSize,
      }
      if (mode === 'download') {
        await triggerFileDownload(filePayload, targetFileName)
      } else {
        setActivePreviewFile(filePayload)
      }
    } catch (error) {
      console.error('Failed to open resource file:', error)
      setActionNotice(error.message || 'This file is unavailable or you do not have access.')
    }
  }

  const handleResendVerification = async () => {
    if (resendingVerification || verificationCooldown > 0) return
    setResendingVerification(true)
    try {
      const { error } = await resendVerification()
      if (error) {
        setActionNotice(error.message || 'Unable to send verification email. Please try again later.')
      } else {
        setActionNotice('Verification email sent! Please check your inbox.')
        setVerificationCooldown(60)
        const interval = setInterval(() => {
          setVerificationCooldown((prev) => {
            if (prev <= 1) {
              clearInterval(interval)
              return 0
            }
            return prev - 1
          })
        }, 1000)
      }
    } catch (err) {
      setActionNotice(err instanceof Error ? err.message : 'Failed to send verification email.')
    } finally {
      setResendingVerification(false)
    }
  }

  const markTeamNotificationsRead = async (teamId) => {
    const unreadTeamNotifications = notifications.filter((item) => item.relatedEntityType === 'TEAM' && item.relatedEntityId === teamId && !item.isRead)
    if (!unreadTeamNotifications.length) return
    await Promise.all(unreadTeamNotifications.map((item) => apiRequest(`/notifications/${item.id}/read`, {
      method: 'PATCH',
      token: session?.access_token,
    })))
    setNotifications((current) => current.map((item) => item.relatedEntityType === 'TEAM' && item.relatedEntityId === teamId && !item.isRead ? { ...item, isRead: true } : item))
    await refreshNotifications()
    await loadMyApplications()
  }

  const markNotificationRead = async (notificationId) => {
    const notification = notifications.find((item) => item.id === notificationId)
    try {
      await apiRequest(`/notifications/${notificationId}/read`, {
        method: 'PATCH',
        token: session?.access_token,
      })
      setNotifications((current) => current.map((item) => item.id === notificationId ? { ...item, isRead: true } : item))
      await refreshNotifications()
      if (notification?.relatedEntityType === 'TEAM') {
        setNotificationsOpen(false)
        go('teams')
        if (notification.type === 'TEAM_JOIN_REQUEST') {
          const post = teamPosts.find((item) => item.id === notification.relatedEntityId)
          if (post) await openTeamRequests(post)
        } else {
          setMyApplicationsOpen(true)
          await loadMyApplications()
        }
      } else if (notification?.relatedEntityType === 'CONVERSATION') {
        setNotificationsOpen(false)
        setSelectedConversationId(notification.relatedEntityId)
        go('messages')
      } else if (notification?.relatedEntityType === 'HELP_REQUEST') {
        setNotificationsOpen(false)
        try {
          const [requestData, jobData] = await Promise.all([
            apiRequest('/help-services/requests', { token: session?.access_token }),
            apiRequest('/help-services', { token: session?.access_token }),
          ])
          setHelpRequests(requestData.requests || [])
          setJobs((jobData.jobs || []).map(normalizeHelpService))
          skillsDataUser.current = user?.id || null
        } catch (error) {
          console.error('Failed to refresh help request before navigation:', error)
          window.alert(error.message || 'Unable to load the related help request.')
        }
        go('skills')
      } else if (notification?.relatedEntityType === 'RESOURCE') {
        setNotificationsOpen(false)
        go('vault')
      }
    } catch (error) {
      console.error('Failed to mark notification read:', error)
    }
  }

  const markAllNotificationsRead = async () => {
    try {
      await apiRequest('/notifications/read-all', {
        method: 'PATCH',
        token: session?.access_token,
      })
      setNotifications((current) => current.map((item) => ({ ...item, isRead: true })))
      await refreshNotifications()
    } catch (error) {
      console.error('Failed to mark notifications read:', error)
    }
  }

  const createResource = async (event) => {
    event.preventDefault()
    if (resourceSaving) return
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const newResource = {
      title: String(form.get('title') || '').trim(),
      type: form.get('type') || 'NOTE',
      subject: form.get('subject') || 'General',
      topic: String(form.get('topic') || 'General').trim() || 'General',
      visibility: form.get('visibility') || 'PUBLIC',
      description: String(form.get('description') || '').trim(),
      tags: String(form.get('tags') || '').split(',').map((tag) => tag.trim()).filter(Boolean),
    }

    if (!newResource.title) {
      return
    }

    const file = form.get('file')
    const resourceFormData = new FormData()
    Object.entries(newResource).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        resourceFormData.append(key, value.join(','))
        return
      }
      resourceFormData.append(key, value)
    })

    if (file && file.size > 0) {
      resourceFormData.append('file', file)
    }

    setResourceSaving(true)
    setResourceSaveError('')
    try {
      const data = await apiRequest('/resources', {
        method: 'POST',
        body: resourceFormData,
        token: session?.access_token,
      });
      setResources((current) => [normalizeResource(data.resource), ...current]);
      setShowResourceModal(false)
      formElement.reset()
    } catch (e) {
      console.error('Failed to create resource:', e);
      setResourceSaveError(e.message || 'Unable to add this resource.')
    } finally {
      setResourceSaving(false)
    }
  }

  const createClass = async (event) => {
    event.preventDefault()
    if (classSaving) return
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const newClass = {
      name: String(form.get('title') || '').trim(),
      description: String(form.get('description') || '').trim(),
    }

    if (!newClass.name) {
      return
    }
    const isEditing = Boolean(editingClass)
    setClassSaving(true)
    try {
      const data = await apiRequest(isEditing ? `/classes/${editingClass.id}` : '/classes', {
        method: isEditing ? 'PUT' : 'POST',
        body: newClass,
        token: session?.access_token,
      });
      const normalized = normalizeStudyClass(data.class)
      setClasses((current) => isEditing
        ? current.map((item) => item.id === normalized.id ? normalized : item)
        : [normalized, ...current])
    } catch (e) {
      console.error('Failed to create class:', e);
      window.alert(e.message || 'Unable to save this class. Please try again.')
      return
    } finally {
      setClassSaving(false)
    }
    setShowClassModal(false)
    setEditingClass(null)
    formElement.reset()
  }

  const publishClassMaterial = async (event) => {
    event.preventDefault()
    if (!publishDialog || publishing) return

    const form = new FormData(event.currentTarget)
    const selectionMode = String(form.get('selectionMode') || 'CLASS')
    const topicIds = form.getAll('topicIds').map(String).filter(Boolean)
    const resourceIds = form.getAll('resourceIds').map(String).filter(Boolean)

    if (selectionMode === 'TOPICS' && topicIds.length === 0) {
      setPublishError('Please select at least one topic to publish.')
      return
    }
    if (selectionMode === 'RESOURCES' && resourceIds.length === 0) {
      setPublishError('Please select at least one study material to publish.')
      return
    }

    const title = String(form.get('title') || '').trim()
    if (!title) {
      setPublishError('Title is required.')
      return
    }

    const access = String(form.get('access') || 'FREE')
    const payload = {
      selectionMode,
      topicIds,
      resourceIds,
      title,
      description: String(form.get('description') || '').trim(),
      subject: String(form.get('subject') || '').trim(),
      topic: String(form.get('topic') || '').trim(),
      tags: String(form.get('tags') || ''),
      degree: String(form.get('degree') || '').trim(),
      semester: String(form.get('semester') || '').trim(),
      type: String(form.get('type') || 'NOTE'),
      access,
      price: access === 'PAID' ? Number(form.get('price')) : null,
      paymentMethod: access === 'PAID' ? String(form.get('paymentMethod') || '') : null,
      upiId: access === 'PAID' ? String(form.get('upiId') || '').trim() : null,
      paymentInstructions: access === 'PAID' ? String(form.get('paymentInstructions') || '').trim() : null,
    }

    setPublishing(true)
    setPublishError('')
    try {
      const data = await apiRequest(`/classes/${publishDialog.id}/publish`, {
        method: 'POST',
        body: payload,
        token: session?.access_token,
      })
      setResources((current) => [normalizeResource(data.resource), ...current.filter((item) => item.id !== data.resource.id)])
      setPublishDialog(null)
      setActionNotice('Study material published to Study Notes Vault!')
    } catch (error) {
      console.error('Failed to publish class material:', error)
      setPublishError(error.message || 'Unable to publish this study material.')
    } finally {
      setPublishing(false)
    }
  }

  const savePublishedResource = async (event) => {
    event.preventDefault()
    if (!editingResource || savingResourceEdit) return
    const form = new FormData(event.currentTarget)
    const isPaid = form.get('access') === 'PAID'
    const payload = {
      title: String(form.get('title') || '').trim(),
      description: String(form.get('description') || '').trim(),
      subject: String(form.get('subject') || '').trim(),
      topic: String(form.get('topic') || '').trim(),
      type: String(form.get('type') || 'NOTE'),
      tags: String(form.get('tags') || '').split(',').map((tag) => tag.trim()).filter(Boolean),
      visibility: String(form.get('visibility') || 'PUBLIC'),
      price: isPaid ? Number(form.get('price')) : null,
      paymentMethod: isPaid ? String(form.get('paymentMethod') || '') : null,
      upiId: isPaid ? String(form.get('upiId') || '').trim() : null,
      paymentInstructions: isPaid ? String(form.get('paymentInstructions') || '').trim() : null,
    }
    setSavingResourceEdit(true)
    try {
      const data = await apiRequest(`/resources/${editingResource.id}`, {
        method: 'PUT',
        body: payload,
        token: session?.access_token,
      })
      let updatedResource = data.resource
      setResources((current) => current.map((item) => item.id === updatedResource.id ? normalizeResource(updatedResource) : item))
      const replacementFile = form.get('replacementFile')
      if (replacementFile instanceof File && replacementFile.size > 0 && updatedResource.files?.[0]) {
        const upload = new FormData()
        upload.append('file', replacementFile)
        const replacement = await apiRequest(`/resources/${updatedResource.id}/files/${updatedResource.files[0].id}`, {
          method: 'PUT',
          body: upload,
          token: session?.access_token,
        })
        updatedResource = {
          ...updatedResource,
          files: updatedResource.files.map((file) => file.id === replacement.file.id ? replacement.file : file),
        }
        setResources((current) => current.map((item) => item.id === updatedResource.id ? normalizeResource(updatedResource) : item))
      }
      setEditingResource(null)
    } catch (error) {
      console.error('Failed to edit Vault resource:', error)
      window.alert(error.message || 'Unable to save this Vault resource.')
    } finally {
      setSavingResourceEdit(false)
    }
  }

  const unpublishResource = async (resource) => {
    if (!window.confirm(`Unpublish "${resource.title}"? It will no longer appear in the public Vault, but you can republish it later.`)) return
    try {
      const data = await apiRequest(`/resources/${resource.id}`, {
        method: 'PUT',
        body: { visibility: 'PRIVATE' },
        token: session?.access_token,
      })
      setResources((current) => current.map((item) => item.id === data.resource.id ? normalizeResource(data.resource) : item))
    } catch (error) {
      console.error('Failed to unpublish Vault resource:', error)
      window.alert(error.message || 'Unable to unpublish this Vault resource.')
    }
  }

  const deleteClass = async (studyClass) => {
    if (!window.confirm(`Delete "${studyClass.name}" and its topics? Linked resources will remain in the vault.`)) return
    try {
      await apiRequest(`/classes/${studyClass.id}`, { method: 'DELETE', token: session?.access_token })
      setClasses((current) => current.filter((item) => item.id !== studyClass.id))
    } catch (error) {
      console.error('Failed to delete class:', error)
      window.alert(error.message || 'Unable to delete this class. Please try again.')
    }
  }

  const saveTopic = async (event) => {
    event.preventDefault()
    if (!topicDialog) return
    const form = new FormData(event.currentTarget)
    const name = String(form.get('name') || '').trim()
    if (!name) return

    const { classId, topic } = topicDialog
    try {
      const data = await apiRequest(topic ? `/classes/${classId}/topics/${topic.id}` : `/classes/${classId}/topics`, {
        method: topic ? 'PUT' : 'POST',
        body: { name },
        token: session?.access_token,
      })
      setClasses((current) => current.map((item) => {
        if (item.id !== classId) return item
        const topics = topic
          ? item.topics.map((existing) => existing.id === topic.id ? { ...existing, ...data.topic } : existing)
          : [...(item.topics || []), data.topic]
        return normalizeStudyClass({ ...item, topics })
      }))
      setTopicDialog(null)
    } catch (error) {
      console.error('Failed to save class topic:', error)
      window.alert(error.message || 'Unable to save this topic. Please try again.')
    }
  }

  const deleteTopic = async (studyClass, topic) => {
    if (!window.confirm(`Delete topic "${topic.name}"? Its class links will be removed, but original resources will remain.`)) return
    try {
      await apiRequest(`/classes/${studyClass.id}/topics/${topic.id}`, { method: 'DELETE', token: session?.access_token })
      setClasses((current) => current.map((item) => item.id === studyClass.id
        ? normalizeStudyClass({ ...item, topics: item.topics.filter((existing) => existing.id !== topic.id) })
        : item))
    } catch (error) {
      console.error('Failed to delete class topic:', error)
      window.alert(error.message || 'Unable to delete this topic. Please try again.')
    }
  }

  const reorderTopic = async (studyClass, topicIndex, offset) => {
    const topics = [...(studyClass.topics || [])].sort((left, right) => left.order - right.order)
    const targetIndex = topicIndex + offset
    if (targetIndex < 0 || targetIndex >= topics.length) return
    ;[topics[topicIndex], topics[targetIndex]] = [topics[targetIndex], topics[topicIndex]]
    const topicIds = topics.map((topic) => topic.id)
    try {
      await apiRequest(`/classes/${studyClass.id}/topics/reorder`, {
        method: 'PATCH',
        body: { topicIds },
        token: session?.access_token,
      })
      const orderedTopics = topics.map((topic, order) => ({ ...topic, order }))
      setClasses((current) => current.map((item) => item.id === studyClass.id
        ? normalizeStudyClass({ ...item, topics: orderedTopics })
        : item))
    } catch (error) {
      console.error('Failed to reorder class topics:', error)
      window.alert(error.message || 'Unable to reorder topics. Please try again.')
    }
  }

  const saveClassResource = async (event) => {
    event.preventDefault()
    if (!resourceDialog || classResourceSavingRef.current) return
    const form = new FormData(event.currentTarget)
    const kind = String(form.get('kind') || 'RESOURCE')
    let body = {}
    let endpoint = `/classes/${resourceDialog.classId}/topics/${resourceDialog.topicId}/resources`
    setClassResourceError('')

    if (kind === 'FILE') {
      const file = form.get('file')
      if (!(file instanceof File) || file.size === 0) {
        setClassResourceError('Choose a file to attach.')
        return
      }
      body = new FormData()
      body.append('file', file)
      endpoint = `/classes/${resourceDialog.classId}/topics/${resourceDialog.topicId}/files`
    } else if (kind === 'RESOURCE') {
      body.resourceId = String(form.get('resourceId') || '')
      if (!body.resourceId) return
    } else {
      const title = String(form.get('title') || '').trim()
      if (kind === 'YOUTUBE') {
        const rawUrl = String(form.get('url') || '').trim()
        const timestampSeconds = Math.max(0, Number.parseInt(String(form.get('timestamp') || '0'), 10) || 0)
        try {
          const url = new URL(rawUrl)
          if (url.protocol !== 'https:' || !['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(url.hostname)) throw new Error('invalid')
          body.notes = JSON.stringify({ format: 'studyos-class-resource', kind, title, url: url.toString(), timestampSeconds })
        } catch {
          window.alert('Enter a valid HTTPS YouTube link.')
          return
        }
      } else {
        const content = String(form.get('content') || '').trim()
        if (!title || !content) return
        body.notes = JSON.stringify({ format: 'studyos-class-resource', kind, title, content })
      }
    }

    classResourceSavingRef.current = true
    setClassResourceSaving(true)
    try {
      const data = await apiRequest(endpoint, {
        method: 'POST',
        body,
        token: session?.access_token,
      })
      setClasses((current) => current.map((item) => item.id === resourceDialog.classId
        ? normalizeStudyClass({
            ...item,
            topics: item.topics.map((topic) => topic.id === resourceDialog.topicId
              ? { ...topic, resources: [...(topic.resources || []), data.classResource] }
              : topic),
          })
        : item))
      setResourceDialog(null)
    } catch (error) {
      console.error('Failed to add class resource:', error)
      setClassResourceError(error.message || 'Unable to add this class material. Please try again.')
    } finally {
      classResourceSavingRef.current = false
      setClassResourceSaving(false)
    }
  }

  const removeClassResource = async (studyClass, topic, classResource) => {
    try {
      await apiRequest(`/classes/${studyClass.id}/topics/${topic.id}/resources/${classResource.id}`, {
        method: 'DELETE',
        token: session?.access_token,
      })
      setClasses((current) => current.map((item) => item.id === studyClass.id
        ? normalizeStudyClass({
            ...item,
            topics: item.topics.map((existingTopic) => existingTopic.id === topic.id
              ? { ...existingTopic, resources: existingTopic.resources.filter((item) => item.id !== classResource.id) }
              : existingTopic),
          })
        : item))
    } catch (error) {
      console.error('Failed to remove class resource:', error)
      window.alert(error.message || 'Unable to remove this class material. Please try again.')
    }
  }

  const createTeam = async (event, roles) => {
    event.preventDefault()
    if (teamSaving) return
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const newTeam = {
      title: String(form.get('title') || '').trim(),
      type: form.get('type') || 'OTHER',
      description: String(form.get('description') || '').trim(),
      reqSkills: String(form.get('skills') || roles.map((role) => role.requiredSkills).filter(Boolean).join(', ')).trim().slice(0, 1000),
      requirements: String(form.get('requirements') || '').trim(),
      roles,
      teamSize: Number(form.get('size') || '4') || 4,
      deadline: String(form.get('deadline') || '') || null,
    }
    if (!newTeam.title || !newTeam.description) {
      return
    }
    const isEditing = Boolean(editingTeam)
    setTeamSaving(true)
    try {
      const data = await apiRequest(isEditing ? `/teams/${editingTeam.id}` : '/teams', {
        method: isEditing ? 'PUT' : 'POST',
        body: newTeam,
        token: session?.access_token,
      });
      const post = normalizeTeamPost(data.teamPost)
      setTeamPosts((current) => isEditing
        ? current.map((item) => item.id === post.id ? post : item)
        : [post, ...current])
      if (!isEditing) setTeamPostCount((count) => count + 1)
    } catch (e) {
      console.error('Failed to create team:', e);
      window.alert(e.message || 'Unable to save this team post. Please try again.')
      return
    } finally {
      setTeamSaving(false)
    }
    setShowTeamModal(false)
    setEditingTeam(null)
    formElement.reset()
  }

  const createJob = async (event) => {
    event.preventDefault()
    if (helpSaving) return
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const paid = form.get('paymentType') === 'PAID'
    const newService = {
      title: String(form.get('title') || '').trim(),
      category: form.get('category') || 'OTHER',
      description: String(form.get('description') || '').trim(),
      skills: String(form.get('skills') || '').trim(),
      deliverables: String(form.get('deliverables') || '').trim(),
      availability: String(form.get('availability') || '').trim(),
      preferredSchedule: String(form.get('preferredSchedule') || '').trim(),
      responseTime: String(form.get('responseTime') || '').trim(),
      expectedTimeline: String(form.get('expectedTimeline') || '').trim(),
      isPaid: paid,
      price: paid && form.get('price') !== '' ? Number(form.get('price')) : null,
      paymentMethod: paid ? form.get('paymentMethod') || null : null,
      upiId: paid ? String(form.get('upiId') || '').trim() : null,
      paymentQrUrl: paid ? String(form.get('paymentQrUrl') || '').trim() : null,
      paymentInstructions: paid ? String(form.get('paymentInstructions') || '').trim() : null,
    }
    if (!newService.title || !newService.description) {
      return
    }
    const isEditing = Boolean(editingJob)
    setHelpSaving(true)
    try {
      const data = await apiRequest(isEditing ? `/help-services/${editingJob.id}` : '/help-services', {
        method: isEditing ? 'PUT' : 'POST',
        body: newService,
        token: session?.access_token,
      });
      const service = normalizeHelpService(data.helpService)
      setJobs((current) => isEditing
        ? current.map((item) => item.id === service.id ? service : item)
        : [service, ...current])
      if (!isEditing) setHelpServiceCount((count) => count + 1)
    } catch (e) {
      console.error('Failed to create help request:', e);
      window.alert(e.message || 'Unable to save this help service. Please try again.')
      return
    } finally {
      setHelpSaving(false)
    }
    setShowJobModal(false)
    setEditingJob(null)
    formElement.reset()
  }

  const deleteResource = async (id) => {
    if (!window.confirm('Delete this resource? This cannot be undone.')) {
      return
    }

    try {
      await apiRequest(`/resources/${id}`, {
        method: 'DELETE',
        token: session?.access_token,
      });
      setResources((current) => current.filter((resource) => resource.id !== id));
    } catch (e) {
      console.error('Failed to delete resource:', e);
    }
  }

  const toggleResourceSave = async (id) => {
    if (!user || !session?.access_token) return

    const resource = resources.find((item) => item.id === id)
    const isSaved = Boolean(resource?.savedByUser)

    try {
      await apiRequest(`/resources/${id}/save`, {
        method: isSaved ? 'DELETE' : 'POST',
        token: session.access_token,
      });

      setResources((current) => current.map((item) => item.id === id ? { ...item, savedByUser: !isSaved, saveCount: Math.max(0, (item.saveCount || 0) + (isSaved ? -1 : 1)) } : item));
      if (detailResource?.id === id) {
        setDetailResource((current) => current ? { ...current, savedByUser: !isSaved, saveCount: Math.max(0, (current.saveCount || 0) + (isSaved ? -1 : 1)) } : null);
      }
      setActionNotice(isSaved ? 'Resource removed from saved bookmarks.' : 'Resource saved to your bookmarks.');
    } catch (e) {
      console.error('Failed to save resource:', e);
      setActionNotice(e.message || 'Unable to update bookmark status.');
      throw e
    }
  }

  const submitResourceRating = async (id, rating) => {
    if (!user || !session?.access_token) return
    setRateSaving(true)
    setRateError('')
    try {
      const data = await apiRequest(`/resources/${id}/rate`, {
        method: 'POST',
        body: { rating },
        token: session.access_token,
      })
      setResources((current) => current.map((item) => item.id === id ? {
        ...item,
        averageRating: data.averageRating ?? rating,
        ratingCount: data.ratingCount ?? ((item.ratingCount || 0) + 1),
      } : item))
      if (detailResource?.id === id) {
        setDetailResource((current) => current ? {
          ...current,
          averageRating: data.averageRating ?? rating,
          ratingCount: data.ratingCount ?? ((current.ratingCount || 0) + 1),
        } : null)
      }
      setRateDialog(null)
      setActionNotice('Thank you! Your rating has been recorded.')
    } catch (error) {
      console.error('Failed to rate resource:', error)
      setRateError(error.message || 'Unable to submit rating.')
    } finally {
      setRateSaving(false)
    }
  }

  const reportResource = async (id, report) => {
    if (!user || !session?.access_token) return

    setReportSaving(true)
    setReportError('')
    try {
      await apiRequest(`/resources/${id}/report`, {
        method: 'POST',
        body: report,
        token: session.access_token,
      });
      setReportDialog(null)
      setActionNotice('Your report was submitted.')
    } catch (error) {
      console.error('Failed to report resource:', error)
      setReportError(error.message || 'Unable to submit the report right now. Please try again.')
    } finally {
      setReportSaving(false)
    }
  }

  const claimJob = async (id, requestDetails) => {
    try {
      await apiRequest(`/help-services/${id}/requests`, {
        method: 'POST',
        body: requestDetails,
        token: session?.access_token,
      });
      const [requestData] = await Promise.all([
        apiRequest('/help-services/requests', { token: session?.access_token }),
        refreshNotifications(),
      ])
      setHelpRequests(requestData.requests || [])
      setHelpRequestDialog(null)
    } catch (error) {
      console.error('Failed to request help service:', error)
      window.alert(error.message || 'Unable to request this service.')
    }
  }

  const addSkill = async (event) => {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const name = String(form.get('skill') || '').trim()
    if (!name) return
    const skillProfile = {
      name,
      proficiency: String(form.get('proficiency') || 'BEGINNER'),
      experience: String(form.get('experience') || '').trim(),
      portfolioUrl: String(form.get('portfolioUrl') || '').trim(),
    }
    try {
      const data = await apiRequest('/skills', { method: 'POST', body: skillProfile, token: session?.access_token })
      setSkills((current) => [...current, data.skill])
      formElement.reset()
    } catch (error) {
      console.error('Failed to add skill:', error)
      window.alert(error.message || 'Unable to add this skill.')
    }
  }

  const updateSkillProfile = async (event, skillId) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const skillProfile = {
      proficiency: String(form.get('proficiency') || 'BEGINNER'),
      experience: String(form.get('experience') || '').trim(),
      portfolioUrl: String(form.get('portfolioUrl') || '').trim(),
    }
    try {
      const data = await apiRequest(`/skills/${skillId}`, { method: 'PUT', body: skillProfile, token: session?.access_token })
      setSkills((current) => current.map((skill) => skill.id === skillId ? data.skill : skill))
    } catch (error) {
      console.error('Failed to update skill profile:', error)
      window.alert(error.message || 'Unable to update this skill profile.')
    }
  }

  const removeSkill = async (skillId) => {
    try {
      await apiRequest(`/skills/${skillId}`, { method: 'DELETE', token: session?.access_token })
      setSkills((current) => current.filter((skill) => skill.id !== skillId))
    } catch (error) {
      console.error('Failed to remove skill:', error)
      window.alert(error.message || 'Unable to remove this skill.')
    }
  }

  const updateHelpRequest = async (requestId, status) => {
    if (updatingHelpRequestId) return
    setUpdatingHelpRequestId(requestId)
    try {
      await apiRequest(`/help-services/requests/${requestId}`, {
        method: 'PATCH',
        body: { status },
        token: session?.access_token,
      })
      const data = await apiRequest('/help-services/requests', { token: session?.access_token })
      setHelpRequests(data.requests || [])
      await refreshNotifications()
      setActionNotice(
        status === 'ACCEPTED' ? 'Help request accepted. You can now chat in private.' :
        status === 'REJECTED' ? 'Help request declined.' :
        status === 'CANCELLED' ? 'Help request cancelled.' :
        'Request updated.'
      )
    } catch (error) {
      console.error('Failed to update help request:', error)
      setActionNotice(error.message || 'Unable to update this help request.')
    } finally {
      setUpdatingHelpRequestId(null)
    }
  }

  const rateHelpRequest = async (requestId, review) => {
    try {
      await apiRequest(`/help-services/requests/${requestId}/review`, {
        method: 'POST',
        body: review,
        token: session?.access_token,
      })
      const data = await apiRequest('/help-services/requests', { token: session?.access_token })
      setHelpRequests(data.requests || [])
      await refreshNotifications()
      setHelpReviewDialog(null)
    } catch (error) {
      console.error('Failed to rate help service:', error)
      window.alert(error.message || 'Unable to submit this rating.')
    }
  }

  const deleteTeam = async (id) => {
    if (window.confirm('Delete this team post? This cannot be undone.')) {
      try {
        await apiRequest(`/teams/${id}`, {
          method: 'DELETE',
          body: { userId: user?.id },
          token: session?.access_token,
        });
        setTeamPosts((current) => current.filter((post) => post.id !== id));
        setTeamPostCount((count) => Math.max(0, count - 1))
      } catch (e) {
        console.error('Failed to delete team:', e);
      }
    }
  }

  const refreshNotifications = async () => {
    try {
      const data = await apiRequest('/notifications', { token: session?.access_token })
      setNotifications(data.notifications || [])
      setUnreadCount(data.unreadCount || 0)
      setNotificationsError('')
    } catch (error) {
      console.error('Failed to refresh notifications:', error)
      setNotificationsError('Notifications are temporarily unavailable.')
    }
  }

  const openConversation = async (contextType, contextId) => {
    try {
      const data = await apiRequest('/conversations/open', {
        method: 'POST',
        body: { contextType, contextId },
        token: session?.access_token,
      })
      setSelectedConversationId(data.conversation.id)
      go('messages')
    } catch (error) {
      console.error('Failed to open conversation:', error)
      setActionNotice(error.message || 'You do not have access to this conversation context.')
    }
  }

  const joinTeam = async (teamId, application) => {
    try {
      const data = await apiRequest(`/teams/${teamId}/requests`, { method: 'POST', body: application, token: session?.access_token })
      setTeamPosts((current) => current.map((post) => post.id === teamId
        ? { ...post, requests: [...(post.requests || []), { id: data.request.id, status: data.request.status }] }
        : post))
      await refreshNotifications()
      setTeamApplicationDialog(null)
    } catch (error) {
      console.error('Failed to request team membership:', error)
      window.alert(error.message || 'Unable to send a join request. Please try again.')
    }
  }

  const withdrawTeamRequest = async (teamId, requestId) => {
    try {
      await apiRequest(`/teams/${teamId}/requests/${requestId}/withdraw`, { method: 'POST', token: session?.access_token })
      setTeamPosts((current) => current.map((post) => post.id === teamId
        ? { ...post, requests: post.requests.map((request) => request.id === requestId ? { ...request, status: 'WITHDRAWN' } : request) }
        : post))
      await loadMyApplications()
    } catch (error) {
      console.error('Failed to withdraw team request:', error)
      window.alert(error.message || 'Unable to withdraw this request.')
    }
  }

  const repostTeam = async (teamId) => {
    try {
      const data = await apiRequest(`/teams/${teamId}/repost`, { method: 'POST', token: session?.access_token })
      const post = normalizeTeamPost(data.teamPost)
      setTeamPosts((current) => current.map((item) => item.id === teamId ? post : item))
    } catch (error) {
      console.error('Failed to repost team opportunity:', error)
      window.alert(error.message || 'Unable to repost this team opportunity.')
    }
  }

  const openTeamRequests = async (post) => {
    try {
      const data = await apiRequest(`/teams/${post.id}/requests`, { token: session?.access_token })
      await markTeamNotificationsRead(post.id)
      setTeamRequestsDialog({ team: post, requests: data.requests || [] })
    } catch (error) {
      console.error('Failed to load team requests:', error)
      window.alert(error.message || 'Unable to load join requests.')
    }
  }

  const loadMyApplications = async () => {
    setMyApplicationsLoading(true)
    try {
      const data = await apiRequest('/teams/my-applications', { token: session?.access_token })
      setMyApplications(data.applications || [])
    } catch (error) {
      console.error('Failed to load my applications:', error)
      window.alert(error.message || 'Unable to load your applications.')
    } finally {
      setMyApplicationsLoading(false)
    }
  }

  const saveRecruiterNotes = async (requestId, notes) => {
    if (!teamRequestsDialog) return
    const teamId = teamRequestsDialog.team.id
    try {
      await apiRequest(`/teams/${teamId}/requests/${requestId}/notes`, {
        method: 'PUT',
        body: { notes },
        token: session?.access_token,
      })
      const data = await apiRequest(`/teams/${teamId}/requests`, { token: session?.access_token })
      setTeamRequestsDialog((current) => current ? { ...current, requests: data.requests || [] } : current)
    } catch (error) {
      console.error('Failed to save recruiter notes:', error)
      window.alert(error.message || 'Unable to save private notes.')
    }
  }

  const decideTeamRequest = async (status, requestId) => {
    if (!teamRequestsDialog || decidingRequestId) return
    const teamId = teamRequestsDialog.team.id
    setDecidingRequestId(requestId)
    setTeamReviewNotice(null)
    try {
      await apiRequest(`/teams/${teamId}/requests/${requestId}`, {
        method: 'PATCH',
        body: { status },
        token: session?.access_token,
      })
      const [teamData, requestsData] = await Promise.all([
        apiRequest(`/teams/${teamId}`, { token: session?.access_token }),
        apiRequest(`/teams/${teamId}/requests`, { token: session?.access_token }),
      ])
      const post = normalizeTeamPost(teamData.teamPost)
      setTeamPosts((current) => current.map((item) => item.id === teamId ? post : item))
      setTeamRequestsDialog({ team: post, requests: requestsData.requests || [] })
      setTeamReviewNotice({
        type: 'success',
        text: status === 'ACCEPTED' ? 'Candidate successfully selected and added to team.' :
              status === 'SHORTLISTED' ? 'Candidate moved to shortlist.' :
              status === 'REJECTED' ? 'Candidate application rejected.' :
              'Application updated to pending.',
      })
      await refreshNotifications()
    } catch (error) {
      console.error('Failed to decide team request:', error)
      setTeamReviewNotice({
        type: 'error',
        text: error.message || 'Unable to update this join request.',
      })
    } finally {
      setDecidingRequestId(null)
    }
  }

  const deleteJob = async (id) => {
    if (window.confirm('Delete this help service? This cannot be undone.')) {
      try {
        await apiRequest(`/help-services/${id}`, {
          method: 'DELETE',
          body: { userId: user?.id },
          token: session?.access_token,
        });
        setJobs((current) => current.filter((job) => job.id !== id));
        setHelpServiceCount((count) => Math.max(0, count - 1))
      } catch (e) {
        console.error('Failed to delete help service:', e);
        window.alert(e.message || 'Unable to delete this help service.')
      }
    }
  }

  const retryLoad = async (section) => {
    if (!session?.access_token) return
    const token = session.access_token
    setRetryingSection(section)
    if (section === 'resources') setResourcesError('')
    if (section === 'classes') setClassesError('')
    if (section === 'summary') setSummaryError('')
    if (['teams', 'skills', 'projects'].includes(section)) setDataLoadError('')
    try {
      if (section === 'resources') {
        const data = await apiRequest('/resources', { token })
        setResources((data.resources || []).map(normalizeResource))
      } else if (section === 'classes') {
        const data = await apiRequest('/classes', { token })
        setClasses((data.classes || []).map(normalizeStudyClass))
      } else if (section === 'summary') {
        const data = await apiRequest('/dashboard/summary', { token })
        setTeamPostCount(data.teamPosts || 0)
        setHelpServiceCount(data.helpServices || 0)
      } else if (section === 'teams') {
        const data = await apiRequest('/teams', { token })
        setTeamPosts((data.teamPosts || []).map(normalizeTeamPost))
        teamDataUser.current = user?.id || null
      } else if (section === 'skills') {
        const [jobsResult, skillsResult, requestsResult] = await Promise.allSettled([
          apiRequest('/help-services', { token }),
          apiRequest('/skills', { token }),
          apiRequest('/help-services/requests', { token }),
        ])
        if (jobsResult.status === 'fulfilled') setJobs((jobsResult.value.jobs || []).map(normalizeHelpService))
        if (skillsResult.status === 'fulfilled') setSkills(skillsResult.value.skills || [])
        if (requestsResult.status === 'fulfilled') setHelpRequests(requestsResult.value.requests || [])
        const failed = [jobsResult, skillsResult, requestsResult].some((result) => result.status === 'rejected')
        if (failed) throw new Error('Some Skills & Help data could not be loaded. Retry to try again.')
        skillsDataUser.current = user?.id || null
      } else if (section === 'projects') {
        const [projectsResult, labsResult] = await Promise.allSettled([
          apiRequest('/projects', { token }),
          apiRequest('/projects/labs', { token }),
        ])
        if (projectsResult.status === 'fulfilled') setProjects((projectsResult.value.projects || []).map(normalizeProject))
        if (labsResult.status === 'fulfilled') setLabs(labsResult.value.labs || [])
        if (projectsResult.status === 'rejected' || labsResult.status === 'rejected') throw new Error('Some project and document data could not be loaded. Retry to try again.')
        projectsDataUser.current = user?.id || null
      }
    } catch (error) {
      console.error(`Failed to retry loading ${section}:`, error)
      if (section === 'resources') setResourcesError(error.message || 'Could not load Vault resources.')
      else if (section === 'classes') setClassesError(error.message || 'Could not load Virtual Study Classes.')
      else if (section === 'summary') setSummaryError(error.message || 'Could not load dashboard summary.')
      else setDataLoadError(error.message || `Could not load ${section}.`)
    } finally {
      setRetryingSection('')
    }
  }

  const createProject = async (event) => {
    event.preventDefault()
    if (projectSaving) return
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const isEditing = Boolean(editingProject)

    const payload = {
      title: String(form.get('title') || '').trim(),
      category: form.get('category') || 'OTHER',
      description: String(form.get('description') || '').trim(),
      technology: String(form.get('technology') || '').trim(),
      githubUrl: String(form.get('githubUrl') || '').trim() || null,
      demoUrl: String(form.get('demoUrl') || '').trim() || null,
      visibility: form.get('visibility') || 'PUBLIC',
      tags: String(form.get('tags') || '').split(',').map((t) => t.trim()).filter(Boolean),
    }

    if (!payload.title) return

    setProjectSaving(true)
    try {
      if (isEditing) {
        const data = await apiRequest(`/projects/${editingProject.id}`, {
          method: 'PUT',
          body: payload,
          token: session?.access_token,
        })
        const norm = normalizeProject(data.project)
        setProjects((curr) => curr.map((p) => p.id === norm.id ? norm : p))
      } else {
        const file = form.get('file')
        let data
        if (file && file.size > 0) {
          const formData = new FormData()
          formData.append('data', JSON.stringify(payload))
          formData.append('file', file)
          data = await apiRequest('/projects', {
            method: 'POST',
            body: formData,
            token: session?.access_token,
          })
        } else {
          const formData = new FormData()
          formData.append('data', JSON.stringify(payload))
          data = await apiRequest('/projects', {
            method: 'POST',
            body: formData,
            token: session?.access_token,
          })
        }
        const norm = normalizeProject(data.project)
        setProjects((curr) => [norm, ...curr])
      }
      setShowProjectModal(false)
      setEditingProject(null)
      formElement.reset()
    } catch (err) {
      console.error('Failed to save project:', err)
      window.alert(err.message || 'Unable to save project.')
    } finally {
      setProjectSaving(false)
    }
  }

  const deleteProject = async (id) => {
    if (!window.confirm('Delete this project? This cannot be undone.')) return
    try {
      await apiRequest(`/projects/${id}`, {
        method: 'DELETE',
        token: session?.access_token,
      })
      setProjects((curr) => curr.filter((p) => p.id !== id))
    } catch (err) {
      console.error('Failed to delete project:', err)
      window.alert(err.message || 'Unable to delete project.')
    }
  }

  const createLab = async (event, selectedFile, onProgress) => {
    event.preventDefault()
    if (labSaving) return
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const isEditing = Boolean(editingLab)
    const payload = new FormData()
    payload.append('name', String(form.get('name') || '').trim())
    payload.append('description', String(form.get('description') || '').trim())
    const file = selectedFile || form.get('file')
    if (file instanceof File && file.size > 0) payload.append('file', file)
    if (!payload.get('name') || !payload.get('description') || (!isEditing && !payload.get('file'))) return

    setLabSaving(true)
    setLabUploadProgress(0)
    try {
      const data = await apiUpload(isEditing ? `/projects/labs/${editingLab.id}` : '/projects/labs', {
        method: isEditing ? 'PUT' : 'POST',
        body: payload,
        token: session?.access_token,
        onProgress: (progress) => {
          setLabUploadProgress(progress)
          onProgress?.(progress)
        },
      })
      if (isEditing) {
        setLabs((curr) => curr.map((l) => l.id === data.lab.id ? data.lab : l))
      } else {
        setLabs((curr) => [data.lab, ...curr])
      }
      setShowLabModal(false)
      setEditingLab(null)
      formElement.reset()
    } catch (err) {
      console.error('Failed to save lab record:', err)
      window.alert(err.message || 'Unable to save lab record.')
    } finally {
      setLabSaving(false)
    }
  }

  const deleteLab = async (id) => {
    if (!window.confirm('Delete this lab record? This cannot be undone.')) return
    try {
      await apiRequest(`/projects/labs/${id}`, {
        method: 'DELETE',
        token: session?.access_token,
      })
      setLabs((curr) => curr.filter((l) => l.id !== id))
    } catch (err) {
      console.error('Failed to delete lab record:', err)
      window.alert(err.message || 'Unable to delete lab record.')
    }
  }

  const openProjectFile = async (projectId, fileId, fileName, mode = 'preview') => {
    try {
      const result = await apiRequest(`/projects/${projectId}/files/${fileId}/access`, {
        token: session?.access_token,
      })
      if (!result?.url && !result?.previewUrl) throw new Error('The file service did not provide a download link.')
      const targetFileName = fileName || result.fileName || 'project-file'
      const filePayload = {
        title: targetFileName,
        fileName: targetFileName,
        url: result.previewUrl || result.url,
        previewUrl: result.previewUrl || result.url,
        downloadUrl: result.downloadUrl || result.url,
        directDownloadUrl: result.directDownloadUrl ? resolveEndpoint(result.directDownloadUrl) : null,
        mimeType: result.mimeType || '',
        fileSize: result.fileSize,
      }
      if (mode === 'download') {
        await triggerFileDownload(filePayload, targetFileName)
      } else {
        setActivePreviewFile(filePayload)
      }
    } catch (error) {
      console.error('Failed to open project file:', error)
      setActionNotice(error.message || 'File link is currently unavailable.')
    }
  }

  const downloadLabDocument = async (labId, fileName, mode = 'preview') => {
    try {
      const result = await apiRequest(`/projects/labs/${labId}/file`, { token: session?.access_token })
      if (!result?.url && !result?.previewUrl) throw new Error('The file service did not provide a download link.')
      const targetFileName = fileName || result.fileName || 'document'
      const filePayload = {
        title: targetFileName,
        fileName: targetFileName,
        url: result.previewUrl || result.url,
        previewUrl: result.previewUrl || result.url,
        downloadUrl: result.downloadUrl || result.url,
        directDownloadUrl: result.directDownloadUrl ? resolveEndpoint(result.directDownloadUrl) : null,
        mimeType: result.mimeType || '',
        fileSize: result.fileSize,
      }
      if (mode === 'download') {
        await triggerFileDownload(filePayload, targetFileName)
      } else {
        setActivePreviewFile(filePayload)
      }
    } catch (error) {
      console.error('Failed to download lab document:', error)
      setActionNotice(error.message || 'Unable to download this document.')
    }
  }

  const go = (key) => {
    setActivePage(key)
    setMobileOpen(false)
    if (key === 'teams') {
      setNotifications((current) => current.map((n) => n.relatedEntityType === 'TEAM' && !n.isRead ? { ...n, isRead: true } : n))
      if (session?.access_token) {
        apiRequest('/notifications/read-all', { method: 'PATCH', token: session.access_token }).catch(() => {})
      }
    }
  }

  const openSearchGroup = (group, item) => {
    const destination = { resources: 'vault', classes: 'classes', projects: 'projects', labs: 'projects', teamPosts: 'teams', helpServices: 'skills', people: 'profile' }[group]
    if (item?.id) {
      if (group === 'people') setSelectedPublicProfileId(item.id)
      if (group === 'resources') setVaultSearch(item.title)
      if (group === 'classes') setExpandedClassId(item.id)
    }
    if (destination) go(destination)
    setSearch('')
    setSearchResults(null)
  }

  return (
    <div className="app-shell">
      {mobileOpen && <button className="mobile-nav-backdrop" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
      <aside className={`sidebar ${mobileOpen ? 'is-open' : ''}`}>
        <div className="brand"><span className="studyos-logo-mark"><img src={studyosMark} alt="" /></span><strong>Study<span>OS</span></strong><small>CSE</small></div>
        <div className="nav-label">OVERVIEW</div>
        <nav>{navItems.map(({ label, icon: Icon, key }) => {
          const badgeCount = key === 'teams' ? (teamPosts.length > 0 ? teamPosts.length : (teamPostCount > 0 ? teamPostCount : 0)) : 0
          return (
            <button key={key} className={`nav-item ${activePage === key ? 'active' : ''}`} onClick={() => go(key)}>
              <Icon size={18} />
              <span>{label}</span>
              {badgeCount > 0 && <i>{badgeCount > 99 ? '99+' : badgeCount}</i>}
            </button>
          )
        })}</nav>
        <div className="nav-label account-label">MY ACCOUNT</div>
        <nav>
          <button className={`nav-item ${activePage === 'account' ? 'active' : ''}`} onClick={() => go('account')}><Settings size={18} /><span>Account & Settings</span></button>
          <button className="nav-item" onClick={signOut} style={{ color: '#ef4444' }}><LogOut size={18} /><span>Sign Out</span></button>
        </nav>
        <div className="campusmate-card">
          <a href={import.meta.env.VITE_CAMPUSMATE_URL || 'https://campassist.me'} className="campassist-title-link" title="Open CampAssist">
            <img src={campassistIcon} alt="CampAssist" className="campassist-logo-img" />
            <span className="brand-wordmark">CampAssist</span>
            <ArrowRight size={13} className="campassist-arrow" />
          </a>
          <p>Access attendance, timetable<br />and other campus features.</p>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMobileOpen((open) => !open)} aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={mobileOpen}><Menu size={20} /></button>
          <div className="mobile-brand"><span className="studyos-logo-mark"><img src={studyosMark} alt="" /></span><strong>Study<span>OS</span></strong></div>
          <div className="search-wrap">
            {search.trim() && <div style={{ position: 'fixed', inset: 0, zIndex: 39 }} onClick={(e) => { e.stopPropagation(); setSearch(''); setSearchResults(null); setSearchError(''); }} />}
            <Search size={17} />
            <input ref={searchInputRef} aria-label="Search StudyOS" role="combobox" aria-expanded={Boolean(search.trim())} aria-controls="search-results" value={search} onChange={(event) => { setSearch(event.target.value); if (!event.target.value.trim()) { setSearchResults(null); setSearchError('') } }} placeholder="Search notes, projects, topics, people, skills..." />
            <kbd>{navigator.userAgent.includes('Mac') ? '⌘' : 'Ctrl'} K</kbd>
            {search.trim() && <button type="button" className="search-clear" aria-label="Clear search" onClick={() => { setSearch(''); setSearchResults(null); setSearchError('') }}><X size={14} /></button>}
            {search.trim() && <SearchResults id="search-results" results={searchResults?.results} loading={searchLoading} error={searchError} query={search} onOpenGroup={openSearchGroup} />}
          </div>
          <div className="top-actions">
            <div className="notification-control" ref={notificationControlRef}>
              <button className="icon-button" aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`} aria-expanded={notificationsOpen} aria-haspopup="true" onClick={() => setNotificationsOpen((open) => !open)}><Bell size={19} />{unreadCount > 0 && <b className="notification-count">{unreadCount > 99 ? '99+' : unreadCount}</b>}</button>
              {notificationsOpen && <div className="notification-popover" role="region" aria-label="Notifications">
                <div className="notification-heading"><strong>Notifications</strong><button onClick={markAllNotificationsRead} disabled={unreadCount === 0}>Mark all read</button></div>
                {notificationsError && <div className="notification-inline-error" role="alert">{notificationsError}{!sessionExpired && <button onClick={refreshNotifications}>Retry</button>}</div>}
                <div className="notification-list">{notifications.length ? notifications.map((item) => <button key={item.id} className={`notification-item ${item.isRead ? 'is-read' : ''}`} onClick={() => markNotificationRead(item.id)}><strong>{item.title}</strong><span>{item.message}</span><small>{new Date(item.createdAt).toLocaleString()}</small></button>) : <p className="notification-empty">{notificationsError ? 'Notifications could not be loaded.' : 'You’re all caught up.'}</p>}</div>
              </div>}
            </div>
            <button className="icon-button" aria-label="Messages" onClick={() => go('messages')}><MessageSquare size={19} /></button>
            <div className="user-menu-wrapper" style={{ position: 'relative' }}>
              <button className="user-menu" onClick={() => go('account')} title="Account" aria-label={`Account menu, ${userName}`}><span className="avatar">{userInitials}</span><strong>{userName}</strong></button>
            </div>
          </div>
        </header>
        <div className="page-body">
          {user && user.emailVerified === false && (
            <div className="email-verification-banner" role="status">
              <span>Your email address is unverified. Verify your email to ensure account recovery and security.</span>
              <button
                type="button"
                className="button ghost"
                disabled={resendingVerification || verificationCooldown > 0}
                onClick={handleResendVerification}
              >
                {verificationCooldown > 0 ? `Resend in ${verificationCooldown}s` : resendingVerification ? 'Sending…' : 'Resend verification email'}
              </button>
            </div>
          )}
          {initialLoading && <div className="data-load-loading" role="status">Loading your StudyOS workspace…</div>}
          {notificationsError && <div className={`data-load-warning ${sessionExpired ? 'session-expired' : ''}`} role="alert">{notificationsError}{sessionExpired ? <button className="button secondary" onClick={signOut}>Sign out</button> : <button className="button ghost" disabled={retryingSection === 'notifications'} onClick={() => { setRetryingSection('notifications'); refreshNotifications().finally(() => setRetryingSection('')) }}>{retryingSection === 'notifications' ? 'Retrying…' : 'Retry notifications'}</button>}</div>}
          {dataLoadError && ['teams', 'skills', 'projects'].includes(activePage) && <div className="data-load-warning" role="alert">{dataLoadError} <button className="button ghost" disabled={retryingSection === activePage} onClick={() => retryLoad(activePage)}>{retryingSection === activePage ? 'Retrying…' : 'Retry'}</button></div>}
          {activePage === 'dashboard' && <Dashboard classes={classes} resources={filteredResources} teamPostCount={teamPostCount} helpServiceCount={helpServiceCount} onAddResource={() => { setResourceSaveError(''); setShowResourceModal(true) }} onAddClass={() => setShowClassModal(true)} onNavigate={go} userName={userName} currentUserId={user?.id} token={session?.access_token} resourcesError={resourcesError} classesError={classesError} summaryError={summaryError} onRetry={retryLoad} retryingSection={retryingSection} />}
          {activePage === 'vault' && <Vault resources={filteredResources} search={vaultSearch} onSearch={(value) => { setVaultSearch(value); }} onAdd={() => { setResourceSaveError(''); setShowResourceModal(true) }} onDelete={deleteResource} onEdit={(item) => { setEditingResource(item); setResourceEditPaid(item.price != null) }} onUnpublish={unpublishResource} onToggleSave={toggleResourceSave} onReport={(id) => { setReportDialog(resources.find((item) => item.id === id) || null); setReportError('') }} onOpenFile={openResourceFile} onRate={(item) => { setRateError(''); setRateDialog(item) }} onViewDetail={(item) => setDetailResource(item)} onOpenProfile={(profileId) => { setSelectedPublicProfileId(profileId); go('profile') }} onNotice={setActionNotice} currentUserId={user?.id} token={session?.access_token} />}
          {activePage === 'classes' && <Classes classes={classes} currentUserId={user?.id} onAdd={() => { setEditingClass(null); setShowClassModal(true) }} onEdit={(item) => { setEditingClass(item); setShowClassModal(true) }} onDelete={deleteClass} onPublish={(item) => { setPublishDialog(item); setPublishMode('CLASS'); setPublishPaid(false); setPublishError('') }} expandedClassId={expandedClassId} onToggleExpanded={(id) => setExpandedClassId((current) => current === id ? null : id)} onAddTopic={(classId) => setTopicDialog({ classId, topic: null })} onEditTopic={(classId, topic) => setTopicDialog({ classId, topic })} onDeleteTopic={deleteTopic} onMoveTopic={reorderTopic} onAddMaterial={(classId, topicId) => { setClassResourceError(''); setClassResourceFileName(''); setResourceKind('RESOURCE'); setResourceDialog({ classId, topicId }) }} onRemoveMaterial={removeClassResource} onOpenFile={openResourceFile} />}
          {activePage === 'teams' && <TeamFinder posts={teamPosts} currentUserId={user?.id} onCreate={() => { setEditingTeam(null); setShowTeamModal(true) }} onEdit={(post) => { setEditingTeam(post); setShowTeamModal(true) }} onDelete={deleteTeam} onJoin={(teamId) => setTeamApplicationDialog(teamPosts.find((post) => post.id === teamId) || null)} onWithdraw={withdrawTeamRequest} onRepost={repostTeam} onManageRequests={openTeamRequests} onOpenConversation={openConversation} myApplications={myApplications} myApplicationsLoading={myApplicationsLoading} onLoadMyApplications={loadMyApplications} showApplications={myApplicationsOpen} onToggleApplications={(show) => { setMyApplicationsOpen(show); if (show) loadMyApplications() }} />}
          {activePage === 'skills' && <SkillsMarketplace jobs={jobs} skills={skills} helpRequests={helpRequests} currentUserId={user?.id} onAddSkill={addSkill} onUpdateSkill={updateSkillProfile} onRemoveSkill={removeSkill} onCreate={() => { setEditingJob(null); setShowJobModal(true) }} onEdit={(job) => { setEditingJob(job); setShowJobModal(true) }} onClaim={(serviceId) => setHelpRequestDialog(jobs.find((job) => job.id === serviceId) || null)} onUpdateRequest={updateHelpRequest} onRateRequest={(requestId) => setHelpReviewDialog(helpRequests.find((request) => request.id === requestId) || null)} onDelete={deleteJob} onOpenConversation={openConversation} onOpenProfile={(profileId) => { setSelectedPublicProfileId(profileId); go('profile') }} updatingRequestId={updatingHelpRequestId} />}
          {activePage === 'account' && <AccountSettings />}
          {activePage === 'profile' && <PublicProfile profileId={selectedPublicProfileId} token={session?.access_token} onBack={() => go('dashboard')} />}
          {activePage === 'messages' && <MessagesPage key={selectedConversationId || 'messages'} token={session?.access_token} currentUserId={user?.id} initialConversationId={selectedConversationId} />}
          {activePage === 'projects' && (
            <ProjectsPage
              projects={projects}
              labs={labs}
              currentUserId={user?.id}
              onCreateProject={() => { setEditingProject(null); setShowProjectModal(true) }}
              onEditProject={(p) => { setEditingProject(p); setShowProjectModal(true) }}
              onDeleteProject={deleteProject}
              onCreateLab={() => { setEditingLab(null); setShowLabModal(true) }}
              onEditLab={(l) => { setEditingLab(l); setShowLabModal(true) }}
              onDeleteLab={deleteLab}
              onOpenFile={openProjectFile}
              onDownloadLab={downloadLabDocument}
              onOpenProfile={(profileId) => { setSelectedPublicProfileId(profileId); go('profile') }}
            />
          )}
        </div>
      </main>

      {showOnboardingModal && (
        <AcademicOnboardingModal
          isOpen={showOnboardingModal}
          onClose={() => {
            if (user?.id) {
              try {
                localStorage.setItem(`studyos_onboarding_dismissed_${user.id}`, 'true')
              } catch (e) {
                console.warn('Storage save error:', e)
              }
            }
            setShowOnboardingModal(false)
          }}
          profile={profile}
          user={user}
          token={session?.access_token}
          onSaved={() => {
            if (user?.id) {
              try {
                localStorage.setItem(`studyos_onboarding_completed_${user.id}`, 'true')
                localStorage.setItem(`studyos_onboarding_dismissed_${user.id}`, 'true')
              } catch (e) {
                console.warn('Storage save error:', e)
              }
            }
            reloadProfile?.()
            setShowOnboardingModal(false)
          }}
        />
      )}

      {showResourceModal && <Modal title="Add a study resource" onClose={() => { if (!resourceSaving) { setResourceSaveError(''); setShowResourceModal(false) } }}><form className="modal-form" onSubmit={createResource}><label>Resource title<input name="title" required placeholder="e.g. Dynamic Programming Notes" /></label><div className="form-row"><label>Resource type<select name="type"><option>NOTE</option><option>PDF</option><option>VIDEO</option><option>LINK</option><option>CODE</option></select></label><label>Subject<input name="subject" placeholder="e.g. DSA" /></label></div><div className="form-row"><label>Topic<input name="topic" placeholder="e.g. Dynamic Programming" /></label><label>Visibility<select name="visibility"><option value="PUBLIC">Public</option><option value="PRIVATE">Private</option></select></label></div><label>Tags<input name="tags" placeholder="DSA, Arrays, Interview Prep" /></label><label>Upload file<input name="file" type="file" accept=".pdf,.doc,.docx,.txt,.md,.zip,.png,.jpg,.jpeg,.webp,.mp4" style={{ padding: '0.5rem', border: '1px dashed #cbd5e1', borderRadius: '0.5rem', width: '100%', background: '#f8fafc', cursor: 'pointer', marginTop: '4px' }} /></label><label>Description<textarea name="description" placeholder="What will other students learn from this?" /></label>{resourceSaveError && <p role="alert" className="class-topic-empty">{resourceSaveError}</p>}<div className="modal-actions"><button type="button" className="button secondary" disabled={resourceSaving} onClick={() => { setResourceSaveError(''); setShowResourceModal(false) }}>Cancel</button><button className="button primary" type="submit" disabled={resourceSaving}><Plus size={16} /> {resourceSaving ? 'Adding…' : 'Add resource'}</button></div></form></Modal>}
      {publishDialog && (
        <Modal title="Publish selected study material" onClose={() => !publishing && setPublishDialog(null)}>
          <form key={publishDialog.id} className="modal-form" onSubmit={publishClassMaterial}>
            <div className="modal-note">
              <strong>1. Select content from {publishDialog.name}</strong>
              <p>Choose whether to publish the entire class or specific topics and study materials.</p>
            </div>

            <div className="publish-mode-options" role="radiogroup" aria-label="Content selection mode">
              <label className={`publish-mode-card ${publishMode === 'CLASS' ? 'is-selected' : ''}`}>
                <input type="radio" name="selectionMode" value="CLASS" checked={publishMode === 'CLASS'} onChange={() => setPublishMode('CLASS')} />
                <div className="publish-mode-label">
                  <strong>Entire class</strong>
                  <small>Publishes all {publishDialog.topics?.length || 0} topics and materials in this class</small>
                </div>
              </label>

              <label className={`publish-mode-card ${publishMode === 'TOPICS' ? 'is-selected' : ''}`}>
                <input type="radio" name="selectionMode" value="TOPICS" checked={publishMode === 'TOPICS'} onChange={() => setPublishMode('TOPICS')} />
                <div className="publish-mode-label">
                  <strong>Selected topics</strong>
                  <small>Pick specific topics to publish</small>
                </div>
              </label>

              {publishMode === 'TOPICS' && (
                <div className="publish-sublist">
                  {(publishDialog.topics || []).length ? (
                    publishDialog.topics.map((topic) => (
                      <label key={topic.id} className="publish-subitem">
                        <input type="checkbox" name="topicIds" value={topic.id} />
                        <div>
                          <strong>{topic.name}</strong>
                          <span className="publish-subitem-desc"> · {topic.resources?.length || 0} materials</span>
                        </div>
                      </label>
                    ))
                  ) : (
                    <p className="class-topic-empty">No topics in this class yet.</p>
                  )}
                </div>
              )}

              <label className={`publish-mode-card ${publishMode === 'RESOURCES' ? 'is-selected' : ''}`}>
                <input type="radio" name="selectionMode" value="RESOURCES" checked={publishMode === 'RESOURCES'} onChange={() => setPublishMode('RESOURCES')} />
                <div className="publish-mode-label">
                  <strong>Selected materials</strong>
                  <small>Choose individual study materials</small>
                </div>
              </label>

              {publishMode === 'RESOURCES' && (
                <div className="publish-sublist">
                  {(publishDialog.topics || []).flatMap((topic) => (topic.resources || []).map((material) => {
                    const label = material.resource?.title || (() => {
                      try { return JSON.parse(material.notes || '{}').title || 'Class note' } catch { return 'Class note' }
                    })()
                    return (
                      <label key={material.id} className="publish-subitem">
                        <input type="checkbox" name="resourceIds" value={material.id} />
                        <div>
                          <strong>{label}</strong>
                          <span className="publish-subitem-desc"> ({topic.name})</span>
                        </div>
                      </label>
                    )
                  })).length ? (
                    (publishDialog.topics || []).flatMap((topic) => (topic.resources || []).map((material) => {
                      const label = material.resource?.title || (() => {
                        try { return JSON.parse(material.notes || '{}').title || 'Class note' } catch { return 'Class note' }
                      })()
                      return (
                        <label key={material.id} className="publish-subitem">
                          <input type="checkbox" name="resourceIds" value={material.id} />
                          <div>
                            <strong>{label}</strong>
                            <span className="publish-subitem-desc"> ({topic.name})</span>
                          </div>
                        </label>
                      )
                    }))
                  ) : (
                    <p className="class-topic-empty">No materials in this class yet.</p>
                  )}
                </div>
              )}
            </div>

            <strong>2. Resource details</strong>
            <label>Title<input name="title" required maxLength={160} placeholder="e.g. Stack Revision Pack" /></label>
            <label>Description<textarea name="description" maxLength={5000} placeholder="Describe what students will find in this material." /></label>
            <div className="form-row"><label>Subject<input name="subject" maxLength={120} placeholder="e.g. Data Structures" /></label><label>Topic<input name="topic" maxLength={120} placeholder="e.g. Revision notes" /></label></div>
            <label>Tags (comma separated)<input name="tags" placeholder="DSA, revision, exam prep" /></label>
            <div className="form-row"><label>Degree / stream<input name="degree" maxLength={120} placeholder="Optional" /></label><label>Semester<input name="semester" maxLength={80} placeholder="Optional" /></label></div>
            <label>Resource type<select name="type" defaultValue="NOTE"><option value="NOTE">NOTE</option><option value="PDF">PDF</option><option value="VIDEO">VIDEO</option><option value="LINK">LINK</option><option value="CODE">CODE</option></select></label>
            <strong>3. Access & Pricing</strong>
            <label>Access<select name="access" value={publishPaid ? 'PAID' : 'FREE'} onChange={(event) => setPublishPaid(event.target.value === 'PAID')}><option value="FREE">Free</option><option value="PAID">Paid</option></select></label>
            {publishPaid && <><div className="form-row"><label>Price (₹)<input name="price" type="number" required min="0.01" step="0.01" /></label><label>Payment method<select name="paymentMethod" required defaultValue="UPI"><option value="UPI">UPI</option><option value="CASH">Cash</option></select></label></div><label>UPI ID (required for UPI)<input name="upiId" placeholder="name@bank" /></label><label>Payment instructions<textarea name="paymentInstructions" maxLength={2000} placeholder="Optional instructions for students." /></label><p className="class-topic-empty">Payment is arranged directly between students. StudyOS does not process or confirm payment.</p></>}
            <strong>4. Academic Guidelines</strong>
            <p className="class-topic-empty">Only publish material you own or have permission to share. Do not share copyrighted course material or someone else’s work without permission.</p>
            {publishError && <p role="alert" className="form-error">{publishError}</p>}
            <div className="modal-actions"><button type="button" className="button secondary" disabled={publishing} onClick={() => setPublishDialog(null)}>Cancel</button><button className="button primary" type="submit" disabled={publishing}>{publishing ? 'Publishing…' : 'Publish to Study Notes Vault'}</button></div>
          </form>
        </Modal>
      )}
      {editingResource && <Modal title="Edit Vault resource" onClose={() => !savingResourceEdit && setEditingResource(null)}><form key={editingResource.id} className="modal-form" onSubmit={savePublishedResource}>
        <label>Title<input name="title" required maxLength={160} defaultValue={editingResource.title} /></label>
        <label>Description<textarea name="description" maxLength={5000} defaultValue={editingResource.description || ''} /></label>
        <div className="form-row"><label>Subject<input name="subject" maxLength={120} defaultValue={editingResource.subject || ''} /></label><label>Topic<input name="topic" maxLength={120} defaultValue={editingResource.topic || ''} /></label></div>
        <label>Tags<input name="tags" defaultValue={editingResource.tags.join(', ')} /></label>
        <div className="form-row"><label>Resource type<select name="type" defaultValue={editingResource.type}><option value="NOTE">NOTE</option><option value="PDF">PDF</option><option value="VIDEO">VIDEO</option><option value="LINK">LINK</option><option value="CODE">CODE</option></select></label><label>Visibility<select name="visibility" defaultValue={editingResource.visibility}><option value="PUBLIC">Public</option><option value="PRIVATE">Private (unpublished)</option></select></label></div>
        {editingResource.files?.length > 0 && <label>Replace {editingResource.files[0].fileName}<input name="replacementFile" type="file" accept=".pdf,.doc,.docx,.txt,.md,.zip,.png,.jpg,.jpeg,.webp,.mp4" /></label>}
        <label>Access<select name="access" value={resourceEditPaid ? 'PAID' : 'FREE'} onChange={(event) => setResourceEditPaid(event.target.value === 'PAID')}><option value="FREE">Free</option><option value="PAID">Paid</option></select></label>
        {resourceEditPaid && <><div className="form-row"><label>Price (₹)<input name="price" type="number" required min="0.01" step="0.01" defaultValue={editingResource.price || ''} /></label><label>Payment method<select name="paymentMethod" required defaultValue={editingResource.paymentMethod || 'UPI'}><option value="UPI">UPI</option><option value="CASH">Cash</option></select></label></div><label>UPI ID<input name="upiId" defaultValue={editingResource.upiId || ''} /></label><label>Payment instructions<textarea name="paymentInstructions" defaultValue={editingResource.paymentInst || ''} /></label><p className="class-topic-empty">Payment is arranged directly between students. StudyOS does not process or confirm payment.</p></>}
        <div className="modal-actions"><button type="button" className="button secondary" disabled={savingResourceEdit} onClick={() => setEditingResource(null)}>Cancel</button><button className="button primary" type="submit" disabled={savingResourceEdit}>{savingResourceEdit ? 'Saving…' : 'Save resource'}</button></div>
      </form></Modal>}
      {showClassModal && <Modal title={editingClass ? 'Edit virtual class' : 'Create a virtual class'} onClose={() => !classSaving && (setShowClassModal(false), setEditingClass(null))}><form key={editingClass?.id || 'new-class'} className="modal-form" onSubmit={createClass}><label>Class name<input name="title" required maxLength={120} defaultValue={editingClass?.name || ''} placeholder="e.g. Cloud Computing" /></label><label>What are you learning?<textarea name="description" maxLength={5000} defaultValue={editingClass?.description || ''} placeholder="Add an optional description" /></label><div className="modal-actions"><button type="button" className="button secondary" disabled={classSaving} onClick={() => { setShowClassModal(false); setEditingClass(null) }}>Cancel</button><button className="button primary" type="submit" disabled={classSaving}><Plus size={16} /> {classSaving ? 'Saving…' : editingClass ? 'Save changes' : 'Create class'}</button></div></form></Modal>}
      {topicDialog && <Modal title={topicDialog.topic ? 'Edit topic' : 'Add a topic'} onClose={() => setTopicDialog(null)}><form key={topicDialog.topic?.id || 'new-topic'} className="modal-form" onSubmit={saveTopic}><label>Topic name<input name="name" required maxLength={120} defaultValue={topicDialog.topic?.name || ''} placeholder="e.g. Arrays" /></label><div className="modal-actions"><button type="button" className="button secondary" onClick={() => setTopicDialog(null)}>Cancel</button><button className="button primary" type="submit">{topicDialog.topic ? 'Save topic' : 'Add topic'}</button></div></form></Modal>}
      {resourceDialog && <Modal title="Add class material" onClose={() => !classResourceSaving && setResourceDialog(null)}>
        <form className="modal-form" onSubmit={saveClassResource}>
          <label>Material type<select name="kind" value={resourceKind} disabled={classResourceSaving} onChange={(event) => setResourceKind(event.target.value)}>
            <option value="RESOURCE">Existing resource</option><option value="FILE">PDF / file</option><option value="YOUTUBE">YouTube video</option><option value="NOTE">Note</option><option value="CODE">Code</option>
          </select></label>
          {resourceKind === 'RESOURCE' ? <label>Resource<select name="resourceId" required defaultValue="" disabled={classResourceSaving}><option value="" disabled>Select a resource</option>{resources.filter((item) => item.visibility === 'PUBLIC' || item.creatorId === user?.id).map((item) => <option key={item.id} value={item.id}>{item.title} · {item.type}</option>)}</select></label>
            : resourceKind === 'FILE' ? <label>Choose a private class file<input name="file" type="file" required accept=".pdf,.doc,.docx,.txt,.md,.zip,.png,.jpg,.jpeg,.webp,.mp4" disabled={classResourceSaving} onChange={(event) => setClassResourceFileName(event.target.files?.[0]?.name || '')} />{classResourceFileName && <small>{classResourceFileName}</small>}<small>Files are private to you and limited to 10 MB.</small></label>
              : resourceKind === 'YOUTUBE' ? <><label>Title<input name="title" required placeholder="Video title" disabled={classResourceSaving} /></label><label>YouTube URL<input name="url" type="url" required placeholder="https://youtu.be/..." disabled={classResourceSaving} /></label><label>Start time in seconds<input name="timestamp" type="number" min="0" defaultValue="0" disabled={classResourceSaving} /></label></>
                : <><label>Title<input name="title" required placeholder={resourceKind === 'CODE' ? 'Code snippet title' : 'Note title'} disabled={classResourceSaving} /></label><label>{resourceKind === 'CODE' ? 'Code' : 'Note'}<textarea name="content" required maxLength={10000} placeholder={resourceKind === 'CODE' ? 'Paste code' : 'Write a class note'} disabled={classResourceSaving} /></label></>}
          {classResourceError && <p role="alert" className="class-topic-empty">{classResourceError}</p>}
          <div className="modal-actions"><button type="button" className="button secondary" disabled={classResourceSaving} onClick={() => setResourceDialog(null)}>Cancel</button><button className="button primary" type="submit" disabled={classResourceSaving}>{classResourceSaving ? 'Uploading…' : 'Add material'}</button></div>
        </form>
      </Modal>}
      {showTeamModal && <Modal title={editingTeam ? 'Edit team opportunity' : 'Create a team opportunity'} onClose={() => !teamSaving && (setShowTeamModal(false), setEditingTeam(null))}><TeamPostForm key={editingTeam?.id || 'new-team'} team={editingTeam} onSubmit={createTeam} saving={teamSaving} /></Modal>}
      {teamApplicationDialog && <Modal title={`Apply to ${teamApplicationDialog.title}`} onClose={() => setTeamApplicationDialog(null)}><TeamApplicationForm post={teamApplicationDialog} profile={profile} skills={skills} onSubmit={joinTeam} /></Modal>}
      {teamRequestsDialog && (
        <Modal
          title={`Applications · ${teamRequestsDialog.team.title}`}
          onClose={() => {
            setTeamRequestsDialog(null)
            setTeamReviewNotice(null)
          }}
        >
          <TeamApplicationReview
            team={teamRequestsDialog.team}
            requests={teamRequestsDialog.requests}
            onDecision={decideTeamRequest}
            onSaveNotes={saveRecruiterNotes}
            decidingRequestId={decidingRequestId}
            notice={teamReviewNotice}
            onOpenChat={() => {
              setTeamRequestsDialog(null)
              go('messages')
            }}
            onOpenProfile={(profileId) => {
              setSelectedPublicProfileId(profileId)
              go('profile')
              setTeamRequestsDialog(null)
            }}
          />
        </Modal>
      )}
      {helpRequestDialog && <Modal title={`Request help · ${helpRequestDialog.title}`} onClose={() => setHelpRequestDialog(null)}><HelpRequestForm service={helpRequestDialog} onSubmit={claimJob} onCancel={() => setHelpRequestDialog(null)} /></Modal>}
      {showJobModal && <Modal title={editingJob ? 'Edit help service' : 'Offer student help'} onClose={() => !helpSaving && (setShowJobModal(false), setEditingJob(null))}><HelpServiceForm service={editingJob} onSubmit={createJob} saving={helpSaving} onCancel={() => { setShowJobModal(false); setEditingJob(null) }} /></Modal>}
      {showProjectModal && <Modal title={editingProject ? 'Edit academic project' : 'Share an academic project'} onClose={() => !projectSaving && (setShowProjectModal(false), setEditingProject(null))}><form key={editingProject?.id || 'new-project'} className="modal-form" onSubmit={createProject}><label>Project title<input name="title" required maxLength={160} defaultValue={editingProject?.title || ''} placeholder="e.g. Distributed Key-Value Store" /></label><div className="form-row"><label>Category<select name="category" defaultValue={editingProject?.category || 'COLLEGE_PROJECT'}><option value="COLLEGE_PROJECT">College Project</option><option value="WEB_APP">Web App</option><option value="MOBILE_APP">Mobile App</option><option value="ML_AI">Machine Learning / AI</option><option value="DATA_SCIENCE">Data Science</option><option value="EMBEDDED">Embedded / IoT</option><option value="GAME">Game Dev</option><option value="API">API / Backend</option><option value="LIBRARY">Library / Tool</option><option value="RESEARCH">Research</option><option value="OTHER">Other</option></select></label><label>Technologies used<input name="technology" maxLength={500} defaultValue={editingProject?.technology || ''} placeholder="e.g. Go, Raft, Docker, Redis" /></label></div><label>Project description<textarea name="description" maxLength={5000} defaultValue={editingProject?.description || ''} placeholder="What problem does it solve and what are the key features?" /></label><div className="form-row"><label>GitHub repository URL<input name="githubUrl" type="url" defaultValue={editingProject?.githubUrl || ''} placeholder="https://github.com/..." /></label><label>Live demo URL<input name="demoUrl" type="url" defaultValue={editingProject?.demoUrl || ''} placeholder="https://..." /></label></div><div className="form-row"><label>Tags (comma-separated)<input name="tags" defaultValue={editingProject?.tags?.join(', ') || ''} placeholder="system-design, distributed, raft" /></label><label>Visibility<select name="visibility" defaultValue={editingProject?.visibility || 'PUBLIC'}><option value="PUBLIC">Public</option><option value="PRIVATE">Private</option></select></label></div>{!editingProject && <label>Upload project file or zip (optional, max 10MB)<input name="file" type="file" accept=".pdf,.doc,.docx,.txt,.md,.zip,.png,.jpg,.jpeg,.webp,.mp4" /></label>}<div className="modal-actions"><button type="button" className="button secondary" disabled={projectSaving} onClick={() => { setShowProjectModal(false); setEditingProject(null) }}>Cancel</button><button className="button primary" type="submit" disabled={projectSaving}><Plus size={16} /> {projectSaving ? 'Saving…' : editingProject ? 'Save changes' : 'Add project'}</button></div></form></Modal>}
      {showLabModal && <Modal title={editingLab ? 'Edit repository document' : 'Upload a repository document'} onClose={() => !labSaving && (setShowLabModal(false), setEditingLab(null))}><LabDocumentForm key={editingLab?.id || 'new-lab-document'} lab={editingLab} saving={labSaving} progress={labUploadProgress} onSubmit={createLab} onCancel={() => { setShowLabModal(false); setEditingLab(null) }} /></Modal>}
      {helpReviewDialog && <Modal title="Rate completed help" onClose={() => setHelpReviewDialog(null)}><ReviewForm request={helpReviewDialog} onSubmit={rateHelpRequest} onClose={() => setHelpReviewDialog(null)} /></Modal>}
      {reportDialog && <Modal title="Report this resource" onClose={() => !reportSaving && setReportDialog(null)}><ReportResourceForm resource={reportDialog} saving={reportSaving} error={reportError} onSubmit={(report) => reportResource(reportDialog.id, report)} onCancel={() => setReportDialog(null)} /></Modal>}
      {rateDialog && <RateResourceModal resource={rateDialog} saving={rateSaving} error={rateError} onSubmit={(score) => submitResourceRating(rateDialog.id, score)} onCancel={() => setRateDialog(null)} />}
      {detailResource && <ResourceDetailModal resource={detailResource} currentUserId={user?.id} onOpenFile={openResourceFile} onToggleSave={toggleResourceSave} onRate={(item) => { setRateError(''); setRateDialog(item) }} onReport={(id) => { setReportDialog(resources.find((item) => item.id === id) || null); setReportError('') }} onOpenProfile={(profileId) => { setSelectedPublicProfileId(profileId); go('profile'); setDetailResource(null) }} onClose={() => setDetailResource(null)} />}
      {activePreviewFile && (
        <FileViewerModal
          file={activePreviewFile}
          onClose={() => setActivePreviewFile(null)}
          onDownload={(fileObj) => triggerFileDownload(fileObj)}
        />
      )}
      {actionNotice && <div className="action-toast" role="status">{actionNotice}</div>}
    </div>
  )
}

function SearchResults({ id, results, loading, error, query, onOpenGroup }) {
  const groups = [
    ['resources', 'Resources'],
    ['classes', 'Virtual classes'],
    ['projects', 'Projects'],
    ['labs', 'Lab records'],
    ['teamPosts', 'Teams'],
    ['helpServices', 'Help services'],
    ['people', 'People and skills'],
  ]
  const populated = groups.filter(([key]) => results?.[key]?.length)
  
  const getIcon = (key) => {
    switch (key) {
      case 'resources': return <FileText size={15} />
      case 'projects': return <FolderKanban size={15} />
      case 'labs': return <Code2 size={15} />
      case 'teamPosts': return <UsersRound size={15} />
      case 'helpServices': return <Sparkles size={15} />
      case 'people': return <UsersRound size={15} />
      default: return <Library size={15} />
    }
  }

  return (
    <div id={id} className="search-results-panel" role="listbox" aria-label="Search results">
      {loading ? (
        <p className="search-results-state" role="status">Searching StudyOS...</p>
      ) : error ? (
        <p className="search-results-state is-error" role="alert">{error}</p>
      ) : populated.length ? (
        populated.map(([key, label]) => (
          <section className="search-results-group" key={key}>
            <div>
              <strong>{label}</strong>
              <button type="button" onClick={() => onOpenGroup(key)}>View all</button>
            </div>
            {results[key].slice(0, 3).map((item) => (
              <button className="search-result-item" key={item.id} role="option" onClick={() => onOpenGroup(key, item)}>
                {key === 'people' && item.avatarUrl ? (
                  <img src={item.avatarUrl} alt="" className="search-result-avatar" />
                ) : (
                  <div className={`search-result-icon is-${key}`}>
                    {getIcon(key)}
                  </div>
                )}
                <div className="search-result-text">
                  <strong>{item.title || item.profile?.fullName || item.name || 'StudyOS member'}</strong>
                  <small>
                    {key === 'resources' ? [item.subject, item.topic, item.creator?.name].filter(Boolean).join(' · ')
                    : key === 'people' ? [item.academicIdentity?.degree || item.profile?.semester, item.academicIdentity?.branch || item.profile?.department, item.skills?.map((skill) => skill.name).join(', ')].filter(Boolean).join(' · ')
                    : key === 'projects' ? [item.category, item.technology].filter(Boolean).join(' · ')
                    : key === 'labs' ? [item.fileName, item.fileMimeType].filter(Boolean).join(' · ') || 'Lab document'
                    : key === 'teamPosts' ? [item.type, item.reqSkills].filter(Boolean).join(' · ')
                    : key === 'helpServices' ? [item.category, item.skills].filter(Boolean).join(' · ')
                    : item.description || 'Virtual study class'}
                  </small>
                </div>
              </button>
            ))}
          </section>
        ))
      ) : (
        <p className="search-results-state">No results for “{query.trim()}”.</p>
      )}
    </div>
  )
}

function MessagesPage({ token, currentUserId, initialConversationId }) {
  const [conversations, setConversations] = useState([])
  const [preferredConversationId, setSelectedId] = useState(initialConversationId)
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) return undefined
    let active = true
    apiRequest('/conversations', { token })
      .then((data) => {
        if (!active) return
        const items = data.conversations || []
        setConversations(items)
        setError('')
      })
      .catch((loadError) => { if (active) setError(loadError.message || 'Unable to load conversations.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [token, initialConversationId])

  const selectedId = conversations.some((item) => item.id === preferredConversationId)
    ? preferredConversationId
    : conversations.some((item) => item.id === initialConversationId) ? initialConversationId : conversations[0]?.id || null;

  useEffect(() => {
    if (!token || !selectedId) return undefined
    let active = true
    apiRequest(`/conversations/${selectedId}/messages?limit=50`, { token })
      .then((data) => { if (active) setMessages(data.messages || []) })
      .catch((loadError) => { if (active) setError(loadError.message || 'Unable to load messages.') })
      .then(async () => {
        if (!active) return
        try {
          await apiRequest(`/conversations/${selectedId}/read`, { method: 'PATCH', token })
          setConversations((current) => current.map((item) => item.id === selectedId ? { ...item, unreadCount: 0 } : item))
        } catch (readError) {
          console.error('Failed to update conversation read state:', readError)
        }
      })
    return () => { active = false }
  }, [selectedId, token])

  const sendMessage = async (event) => {
    event.preventDefault()
    const content = draft.trim()
    if (!content || !selectedId || sending) return
    setSending(true)
    setError('')
    try {
      const data = await apiRequest(`/conversations/${selectedId}/messages`, {
        method: 'POST',
        body: { content },
        token,
      })
      setMessages((current) => [...current, data.message])
      setDraft('')
      const list = await apiRequest('/conversations', { token })
      setConversations(list.conversations || [])
    } catch (sendError) {
      setError(sendError.message || 'Unable to send this message.')
    } finally {
      setSending(false)
    }
  }

  const titleFor = (conversation) => {
    if (conversation.contextType === 'TEAM') return 'Team collaboration'
    if (conversation.contextType === 'HELP_REQUEST') return 'Help request'
    return conversation.members.map((member) => member.user?.name).filter(Boolean).join(', ') || 'Conversation'
  }

  return <section className="messages-page"><aside className="conversation-list"><div className="conversation-list-heading"><h1>Messages</h1><p>Academic and project conversations</p></div>{loading ? <p className="conversation-state">Loading conversations...</p> : conversations.length ? conversations.map((conversation) => <button key={conversation.id} className={`conversation-list-item ${selectedId === conversation.id ? 'active' : ''}`} onClick={() => setSelectedId(conversation.id)}><strong>{titleFor(conversation)}</strong><small>{conversation.messages[0]?.content || 'No messages yet'}</small>{conversation.unreadCount > 0 && <span className="conversation-unread">{conversation.unreadCount}</span>}</button>) : <p className="conversation-state">No conversations yet. Team and accepted help conversations appear here.</p>}</aside><div className="conversation-panel">{selectedId ? <><div className="conversation-header"><strong>{titleFor(conversations.find((item) => item.id === selectedId) || { contextType: null, members: [] })}</strong></div><div className="message-history">{messages.length ? messages.map((message) => <article className={`message-bubble ${message.senderId === currentUserId ? 'mine' : ''}`} key={message.id}><strong>{message.sender?.name || 'Student'}</strong><p>{message.content}</p><small>{new Date(message.createdAt).toLocaleString()}</small></article>) : !loading && <p className="conversation-state">No messages yet. Start the conversation.</p>}</div><form className="message-composer" onSubmit={sendMessage}><textarea value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={5000} placeholder="Write an academic or project message..." /><button className="button primary" type="submit" disabled={sending || !draft.trim()} aria-label="Send message"><Send size={16} /> Send</button></form></> : <div className="conversation-empty"><MessageSquare size={26} /><strong>Select a conversation</strong><p>Accepted team and help conversations will appear here.</p></div>}{error && <p className="conversation-error">{error}</p>}</div></section>
}

function PublicProfile({ profileId, token, onBack }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(Boolean(profileId && token))
  const [error, setError] = useState(profileId && token ? '' : 'This profile is unavailable.')

  useEffect(() => {
    if (!profileId || !token) return undefined
    let active = true
    apiRequest(`/public-profile/${profileId}`, { token })
      .then((data) => { if (active) setUser(data.user) })
      .catch((loadError) => { if (active) setError(loadError.message || 'This profile is unavailable.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [profileId, token])

  if (loading) return <div className="empty-state"><strong>Loading profile...</strong></div>
  if (error || !user) return <section className="placeholder-page"><h1>Profile unavailable</h1><p>{error || 'This profile is private.'}</p><button className="button ghost" onClick={onBack}>Back to dashboard</button></section>

  const identity = user.academicIdentity || {}
  const profile = user.profile || {}
  const skills = Array.isArray(user.skills) ? user.skills : []

  return (
    <section className="account-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">PUBLIC ACADEMIC PROFILE</p>
          <h1>{user.name || profile.fullName || 'StudyOS member'}</h1>
          <p>{[identity.degree, identity.stream, identity.branch || profile.department, identity.institution || profile.institution].filter(Boolean).join(' · ')}</p>
        </div>
        <button className="button ghost" onClick={onBack}>Back to dashboard</button>
      </div>

      <div className="account-layout">
        <div className="account-panel profile-panel">
          <div className="panel-heading">
            <div className="profile-avatar">{(user.name || 'ST').slice(0, 2).toUpperCase()}</div>
            <div>
              <h2>{user.name || 'Student'}</h2>
              <div style={{ display: 'flex', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
                {profile.residency && (
                  <span className="type-pill">
                    {profile.residency === 'HOSTELER' ? '🏠 Hostel Resident' : '🎒 Day Scholar'}
                  </span>
                )}
                {profile.semester && <span className="type-pill">Semester {profile.semester}</span>}
                {profile.section && <span className="type-pill">Section {profile.section}</span>}
                {profile.rollNumber && <span className="type-pill">Roll #{profile.rollNumber}</span>}
              </div>
            </div>
          </div>

          {profile.bio && (
            <p className="resource-detail-desc" style={{ margin: '14px 0' }}>
              {profile.bio}
            </p>
          )}

          {profile.experience && (
            <div style={{ margin: '14px 0' }}>
              <strong style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b' }}>Experience & Background</strong>
              <p style={{ fontSize: '13px', color: '#334155', marginTop: '4px', whiteSpace: 'pre-wrap' }}>{profile.experience}</p>
            </div>
          )}

          {skills.length > 0 && (
            <div className="skill-profile-list" style={{ marginTop: '14px' }}>
              {skills.map((skill) => (
                <article className="skill-profile-card public-skill" key={skill.id || skill.name}>
                  <strong>{skill.name}</strong>
                  <span>{String(skill.proficiency || 'SKILLED').toLowerCase()}</span>
                  {skill.experience && <p>{skill.experience}</p>}
                  {skill.portfolioUrl && (
                    <a href={skill.portfolioUrl} target="_blank" rel="noreferrer">
                      View portfolio <ExternalLink size={13} />
                    </a>
                  )}
                </article>
              ))}
            </div>
          )}

          <div className="profile-links" style={{ marginTop: '16px' }}>
            {identity.github && <a href={identity.github} target="_blank" rel="noreferrer">GitHub</a>}
            {identity.linkedin && <a href={identity.linkedin} target="_blank" rel="noreferrer">LinkedIn</a>}
            {identity.portfolio && <a href={identity.portfolio} target="_blank" rel="noreferrer">Portfolio</a>}
          </div>
        </div>
      </div>
    </section>
  )
}

function Dashboard({ classes, resources, teamPostCount, helpServiceCount, onAddResource, onAddClass, onNavigate, userName, currentUserId, token, resourcesError, classesError, summaryError, onRetry, retryingSection }) {
  const [now, setNow] = useState(null)
  const myResourceCount = resources.filter((item) => item.creatorId === currentUserId || item.creator?.id === currentUserId).length
  const savedCount = resources.filter((item) => item.savedByUser).length
  const classCount = classes.length
  useEffect(() => {
    const updateClock = () => setNow(new Date())
    updateClock()
    const interval = setInterval(updateClock, 60000)
    return () => clearInterval(interval)
  }, [])

  return <>
    <section className="welcome-banner"><div><p className="eyebrow">{now ? now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase() : 'YOUR STUDYOS WORKSPACE'}</p><h1>{now ? (now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening') : 'Welcome'} <span className="wave">✦</span>, {userName}!</h1><p className="welcome-copy">Keep learning, building and collaborating.<br />Your academic journey, now better organized with StudyOS.</p><div className="hero-actions"><button className="button primary" onClick={onAddResource}><Plus size={16} /> Add Resource</button><button className="button ghost" onClick={() => onNavigate('vault')}><Library size={15} /> Explore Vault <ArrowRight size={14} /></button></div></div><div className="hero-art"><div className="sun-orb"></div><div className="book-stack"><span></span><span></span><span></span></div><GraduationCap size={63} /></div></section>
    
    {summaryError ? (
      <div className="data-load-warning" style={{marginBottom: 16}} role="alert">{summaryError} <button className="button ghost" disabled={retryingSection === 'summary'} onClick={() => onRetry('summary')}>{retryingSection === 'summary' ? 'Retrying…' : 'Retry'}</button></div>
    ) : (
      <div className="stat-grid"><Stat label="My Classes" value={`${classCount} / 10`} icon={BookOpen} tone="green" /><Stat label="Saved Resources" value={String(savedCount)} icon={Bookmark} tone="blue" /><Stat label="My Contributions" value={String(myResourceCount)} icon={Star} tone="yellow" /><Stat label="Open Teams" value={String(teamPostCount)} icon={UsersRound} tone="pink" /><Stat label="Help Services" value={String(helpServiceCount)} icon={MessageSquare} tone="mint" /></div>
    )}

    <section className="section-card classes-section">
      <SectionHeader title="My Virtual Study Classes" action="View all" onClick={() => onNavigate('classes')} />
      {classesError ? (
        <div className="data-load-warning" role="alert">{classesError} <button className="button ghost" disabled={retryingSection === 'classes'} onClick={() => onRetry('classes')}>{retryingSection === 'classes' ? 'Retrying…' : 'Retry'}</button></div>
      ) : (
        <div className="class-grid">{classes.length ? classes.slice(0, 4).map((item) => <ClassCard key={item.id} item={item} />) : <div className="dashboard-empty"><strong>No study classes yet</strong><span>Create a focused space for your next subject.</span></div>}<button className="create-class" onClick={onAddClass}><Plus size={21} /><strong>Create Class</strong></button></div>
      )}
    </section>
    
    <div className="lower-grid">
      <section className="section-card resource-card">
        <SectionHeader title="Recent Resources" action="View all" onClick={() => onNavigate('vault')} />
        {resourcesError ? (
          <div className="data-load-warning" role="alert">{resourcesError} <button className="button ghost" disabled={retryingSection === 'resources'} onClick={() => onRetry('resources')}>{retryingSection === 'resources' ? 'Retrying…' : 'Retry'}</button></div>
        ) : (
          resources.length ? <ResourceList resources={resources.slice(0, 5)} onNavigate={() => onNavigate('vault')} /> : <div className="dashboard-empty"><strong>No recent resources</strong><span>Upload notes or browse what your classmates have shared.</span><button className="button ghost" onClick={() => onNavigate('vault')}>Explore Vault</button></div>
        )}
      </section>
      <section className="section-card activity-card"><SectionHeader title="Your Activity" action="View resources" onClick={() => onNavigate('vault')} /><Activity resources={resources.slice(0, 3)} /></section>
    </div>
  </>
}

function Vault({ resources, search, onSearch, onAdd, onDelete, onEdit, onUnpublish, onToggleSave, onReport, onOpenFile, onRate, onViewDetail, onOpenProfile, onNotice, currentUserId, token }) {
  const [sort, setSort] = useState('newest')
  const [visibility, setVisibility] = useState('all')
  const [pendingAction, setPendingAction] = useState('')
  const visibleResources = useMemo(() => [...resources]
    .filter((item) => {
      if (visibility === 'saved') return Boolean(item.savedByUser)
      if (visibility === 'public') return item.visibility === 'PUBLIC'
      if (visibility === 'mine') return item.visibility !== 'PUBLIC' && currentUserId === item.creatorId
      return true
    })
    .sort((left, right) => sort === 'oldest'
      ? new Date(left.createdAt || 0) - new Date(right.createdAt || 0)
      : new Date(right.createdAt || 0) - new Date(left.createdAt || 0)), [resources, visibility, sort, currentUserId])

  const runAction = async (key, action) => {
    if (pendingAction) return
    setPendingAction(key)
    try {
      await action()
    } catch (error) {
      console.error(`Vault action failed (${key}):`, error)
      onNotice(error.message || 'This action could not be completed. Please try again.')
    } finally {
      setPendingAction('')
    }
  }

  return <section className="vault-page">
    <div className="page-heading"><div><p className="eyebrow">STUDYOS LIBRARY</p><h1>Study Notes & Resources Vault</h1><p>Discover notes, guides and resources shared by your academic community.</p></div><button className="button primary" onClick={onAdd}><Plus size={16} /> Add Resource</button></div>
    <div className="vault-toolbar">
      <div className="vault-search"><Search size={17} /><input value={search} onChange={(event) => onSearch(event.target.value)} aria-label="Search Vault resources" placeholder="Search resources..." /></div>
      <select aria-label="Filter resources by visibility" value={visibility} onChange={(event) => setVisibility(event.target.value)}>
        <option value="all">All visible resources</option>
        <option value="saved">Saved / Bookmarked</option>
        <option value="public">Public resources</option>
        <option value="mine">My unpublished resources</option>
      </select>
      <select aria-label="Sort resources" value={sort} onChange={(event) => setSort(event.target.value)}>
        <option value="newest">Newest first</option>
        <option value="oldest">Oldest first</option>
      </select>
    </div>
    <div className="vault-list">{visibleResources.length ? visibleResources.map((item) => {
      const isOwner = currentUserId === item.creatorId
      const isPrivate = item.visibility && item.visibility !== 'PUBLIC'
      const creatorLabel = item.creatorName || 'Student'
      return <div className="vault-entry" key={item.id}><article className="vault-row">
        <div className={`resource-thumb ${item.color || 'purple'}`}><FileText size={22} /></div>
        <div className="vault-info">
          <div className="resource-title-line">
            <strong
              role="button"
              tabIndex={0}
              className="resource-title-link"
              onClick={() => onViewDetail(item)}
              onKeyDown={(e) => e.key === 'Enter' && onViewDetail(item)}
              style={{ cursor: 'pointer' }}
              title="Click to view details"
            >
              {item.title}
            </strong>
            {item.type && <span className="type-pill">{item.type}</span>}
            {isPrivate && isOwner && <span className="type-pill">Private</span>}
          </div>
          <p>{[item.subjectLabel, item.tags.join(', ') || 'General topic'].filter(Boolean).join(' · ')} · Shared by <button className="profile-link-button" type="button" disabled={isOwner} onClick={() => onOpenProfile(item.creator?.id || item.creatorId)}>{creatorLabel}</button></p>
          {item.price != null && <small>{`₹${item.price} · ${item.paymentMethod || 'Direct payment'}`}</small>}
          {item.paymentInst && <small>{item.paymentInst}</small>}
          {item.upiId && <small>UPI: {item.upiId}</small>}
          <small>{item.createdAt ? new Date(item.createdAt).toLocaleDateString() : 'Study resource'}{item.visibility ? ` · ${isPrivate ? 'Private' : 'Public'}` : ''}</small>
        </div>
        <div
          className={`vault-rating ${!isOwner && !isPrivate ? 'is-clickable' : ''}`}
          onClick={() => !isOwner && !isPrivate && onRate(item)}
          title={isOwner ? 'You cannot rate your own resource' : 'Click to rate this resource'}
          style={{ cursor: !isOwner && !isPrivate ? 'pointer' : 'default' }}
          aria-label={`${item.ratingCount || 0} ratings`}
        >
          <Star size={14} fill={item.ratingCount ? 'currentColor' : 'none'} /> {item.ratingCount ? `${item.averageRating.toFixed(1)} · (${item.ratingCount})` : 'Not rated yet'}
        </div>
        <div className="post-actions">
          <button className="button ghost" onClick={() => onViewDetail(item)}>Details</button>
          {item.files?.map((file) => <button key={file.id} className="button ghost" disabled={Boolean(pendingAction)} onClick={() => runAction(`file-${file.id}`, () => onOpenFile(item.id, file.id, file.fileName))}><Download size={14} /> Open {file.fileName || 'file'}</button>)}
          <button className="button ghost" disabled={Boolean(pendingAction)} onClick={() => runAction(`save-${item.id}`, () => onToggleSave(item.id))}>{pendingAction === `save-${item.id}` ? 'Saving…' : item.savedByUser ? 'Unsave' : 'Save'}</button>
          {!isOwner && !isPrivate && <button className="button ghost" onClick={() => onRate(item)}><Star size={13} /> Rate</button>}
          {isOwner && <><button className="button ghost" disabled={Boolean(pendingAction)} onClick={() => onEdit(item)}>Edit</button>{item.visibility === 'PUBLIC' && <button className="button ghost" disabled={Boolean(pendingAction)} onClick={() => runAction(`unpublish-${item.id}`, () => onUnpublish(item))}>Unpublish</button>}<button className="icon-danger" disabled={Boolean(pendingAction)} onClick={() => runAction(`delete-${item.id}`, () => onDelete(item.id))} aria-label="Delete resource" title="Delete resource"><Trash2 size={15} /></button></>}
          {!isPrivate && !isOwner && <button className="button ghost" disabled={Boolean(pendingAction)} onClick={() => onReport(item.id)}>Report</button>}
        </div>
      </article><ResourceDiscussion resource={item} currentUserId={currentUserId} token={token} onOpenProfile={onOpenProfile} /></div>
    }) : <div className="empty-state"><Library size={29} /><strong>{search.trim() ? 'No matching resources' : visibility === 'saved' ? 'No saved resources yet' : 'No resources found'}</strong><p>{search.trim() ? 'Try a different search term or clear the search.' : visibility === 'saved' ? 'Click Save on any resource card in the Vault to bookmark it here.' : 'Try a different visibility filter or add the first resource.'}</p>{search.trim() ? <button className="button secondary" onClick={() => onSearch('')}>Clear search</button> : <button className="button primary" onClick={onAdd}><Plus size={16} /> Add resource</button>}</div>}</div>
  </section>
}

function ResourceDiscussion({ resource, currentUserId, token, onOpenProfile }) {
  const [open, setOpen] = useState(false)
  const [comments, setComments] = useState([])
  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editingText, setEditingText] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await discussionApi.list(resource.id, token)
      setComments(data.comments || [])
      setLoaded(true)
    } catch (loadError) {
      setError(loadError.status === 404
        ? 'Resource discussions are not available on the server yet. No comments have been stored.'
        : loadError.message || 'Unable to load this discussion.')
    } finally {
      setLoading(false)
    }
  }

  const toggle = async () => {
    const nextOpen = !open
    setOpen(nextOpen)
    if (nextOpen && !loaded && !loading) await load()
  }

  const submit = async (event) => {
    event.preventDefault()
    const content = draft.trim()
    if (!content || saving) return
    setSaving(true)
    setError('')
    try {
      const data = await discussionApi.create(resource.id, content, token)
      if (!data?.comment) throw new Error('The discussion service did not confirm a saved comment.')
      setComments((current) => [...current, data.comment])
      setDraft('')
    } catch (saveError) {
      setError(saveError.status === 404
        ? 'Comments cannot be saved until resource discussions are enabled on the server.'
        : saveError.message || 'Unable to submit your comment.')
    } finally {
      setSaving(false)
    }
  }

  const saveEdit = async (commentId) => {
    const content = editingText.trim()
    if (!content || saving) return
    setSaving(true)
    setError('')
    try {
      const data = await discussionApi.update(resource.id, commentId, content, token)
      if (!data?.comment) throw new Error('The discussion service did not confirm the saved edit.')
      setComments((current) => current.map((comment) => comment.id === commentId ? data.comment : comment))
      setEditingId(null)
      setEditingText('')
    } catch (saveError) {
      setError(saveError.status === 404 ? 'Comment editing is not available on the server yet.' : saveError.message || 'Unable to edit this comment.')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (commentId) => {
    if (saving || !window.confirm('Delete your comment?')) return
    setSaving(true)
    setError('')
    try {
      await discussionApi.remove(resource.id, commentId, token)
      setComments((current) => current.filter((comment) => comment.id !== commentId))
    } catch (removeError) {
      setError(removeError.status === 404 ? 'Comment deletion is not available on the server yet.' : removeError.message || 'Unable to delete this comment.')
    } finally {
      setSaving(false)
    }
  }

  return <section className="resource-discussion">
    <button type="button" className={`discussion-toggle ${open ? 'is-open' : ''}`} aria-expanded={open} onClick={toggle}>
      <MessageSquare size={13} />
      <span>{open ? 'Hide discussion' : 'Discussion'}</span>
      {loaded && comments.length > 0 && <span className="discussion-count">{comments.length}</span>}
      {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
    </button>
    {open && <div className="discussion-content">
      {loading ? <p role="status">Loading discussion…</p> : error && !loaded ? <div className="comment-integration-note" role="status">{error}</div> : <>
        {comments.length ? <div className="discussion-comments">{comments.map((comment) => <article className="discussion-comment" key={comment.id}>
          <div className="discussion-comment-heading"><strong><button className="profile-link-button" type="button" disabled={!comment.author?.id || comment.author.id === currentUserId} onClick={() => comment.author?.id && onOpenProfile(comment.author.id)}>{comment.author?.name || 'Student'}</button></strong><time dateTime={comment.createdAt}>{comment.createdAt ? new Date(comment.createdAt).toLocaleString() : ''}</time></div>
          {editingId === comment.id ? <><textarea aria-label="Edit comment" value={editingText} maxLength={2000} onChange={(event) => setEditingText(event.target.value)} /><div className="post-actions"><button type="button" className="button secondary" onClick={() => setEditingId(null)}>Cancel</button><button type="button" className="button primary" disabled={saving || !editingText.trim()} onClick={() => saveEdit(comment.id)}>{saving ? 'Saving…' : 'Save edit'}</button></div></> : <p>{comment.content}</p>}
          {comment.authorId === currentUserId && editingId !== comment.id && <div className="post-actions"><button type="button" className="button ghost" disabled={saving} onClick={() => { setEditingId(comment.id); setEditingText(comment.content) }}>Edit</button><button type="button" className="button ghost" disabled={saving} onClick={() => remove(comment.id)}>Delete</button></div>}
        </article>)}</div> : <p className="class-topic-empty">No comments yet. Start a respectful academic discussion.</p>}
        <form className="discussion-composer" onSubmit={submit}><label htmlFor={`comment-${resource.id}`}>Add a comment</label><textarea id={`comment-${resource.id}`} value={draft} maxLength={2000} onChange={(event) => setDraft(event.target.value)} placeholder="Share a question or helpful insight…" /><div><small>{draft.length}/2000</small><button className="button primary" type="submit" disabled={saving || !draft.trim()}>{saving ? 'Posting…' : 'Post comment'}</button></div></form>
      </>}
      {error && loaded && <p className="form-error" role="alert">{error}</p>}
    </div>}
  </section>
}

function Classes({ classes, currentUserId, onAdd, onEdit, onDelete, onPublish, expandedClassId, onToggleExpanded, onAddTopic, onEditTopic, onDeleteTopic, onMoveTopic, onAddMaterial, onRemoveMaterial, onOpenFile }) {
  return <section className="classes-page">
    <div className="page-heading"><div><p className="eyebrow">MY LEARNING SPACE</p><h1>Virtual Study Classes</h1><p>Build focused learning spaces for the subjects you care about.</p></div><button className="button primary" onClick={onAdd} disabled={classes.length >= 10}><Plus size={16} /> Create class <span>{classes.length}/10</span></button></div>
    <div className="full-class-grid">
      {classes.map((item) => <div className="class-workspace" key={item.id}>
        <ClassCard item={item} large />
        <div className="class-workspace-actions"><button className="button ghost" onClick={() => onToggleExpanded(item.id)}>{expandedClassId === item.id ? 'Hide topics' : `Topics (${item.topicCount})`}</button>{item.creatorId === currentUserId && <><button className="button ghost" onClick={() => onPublish(item)}>Publish selected material</button><button className="icon-button" aria-label={`Edit ${item.name}`} title="Edit class" onClick={() => onEdit(item)}><Pencil size={15} /></button><button className="icon-danger" aria-label={`Delete ${item.name}`} title="Delete class" onClick={() => onDelete(item)}><Trash2 size={15} /></button></>}</div>
        {expandedClassId === item.id && <div className="class-topic-section">
          <div className="class-topic-heading"><strong>Topics and materials</strong>{item.creatorId === currentUserId && <button className="button ghost" onClick={() => onAddTopic(item.id)}><Plus size={14} /> Add topic</button>}</div>
          {item.topics?.length ? [...item.topics].sort((left, right) => left.order - right.order).map((topic, index, orderedTopics) => <article className="class-topic" key={topic.id}>
            <div className="class-topic-title"><strong>{topic.name}</strong>{item.creatorId === currentUserId && <div className="class-topic-actions"><button className="icon-button" disabled={index === 0} aria-label={`Move ${topic.name} up`} onClick={() => onMoveTopic(item, index, -1)}><ChevronUp size={15} /></button><button className="icon-button" disabled={index === orderedTopics.length - 1} aria-label={`Move ${topic.name} down`} onClick={() => onMoveTopic(item, index, 1)}><ChevronDown size={15} /></button><button className="icon-button" aria-label={`Edit ${topic.name}`} onClick={() => onEditTopic(item.id, topic)}><Pencil size={14} /></button><button className="icon-danger" aria-label={`Delete ${topic.name}`} onClick={() => onDeleteTopic(item, topic)}><Trash2 size={14} /></button></div>}</div>
            {topic.resources?.length ? <ul>{topic.resources.map((material) => <li key={material.id}><ClassMaterial material={material} onOpenFile={onOpenFile} />{item.creatorId === currentUserId && <button className="icon-danger" aria-label="Remove material from topic" onClick={() => onRemoveMaterial(item, topic, material)}><X size={13} /></button>}</li>)}</ul> : <p className="class-topic-empty">No material added yet.</p>}
            {item.creatorId === currentUserId && <button className="button ghost class-add-material" onClick={() => onAddMaterial(item.id, topic.id)}><Plus size={14} /> Add material</button>}
          </article>) : <p className="class-topic-empty">No topics yet.</p>}
        </div>}
      </div>)}
      <button className="create-class large" onClick={onAdd} disabled={classes.length >= 10}><Plus size={24} /><strong>Create a new class</strong><span>{classes.length >= 10 ? 'Class limit reached' : 'Start a focused study workspace'}</span></button>
    </div>
  </section>
}

function parseClassMaterial(notes) {
  try {
    return JSON.parse(notes || '{}')
  } catch {
    return null
  }
}

function getSafeYoutubeUrl(rawUrl, timestamp) {
  try {
    const videoUrl = new URL(rawUrl)
    if (videoUrl.protocol !== 'https:' || !['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(videoUrl.hostname)) return null
    videoUrl.searchParams.set('t', String(timestamp || 0))
    return videoUrl.toString()
  } catch {
    return null
  }
}

function ClassMaterial({ material, onOpenFile }) {
  if (material.resource) {
    return <span><strong>{material.resource.title}</strong><small>{material.resource.type}</small>{material.resource.files?.map((file) => <button className="button ghost" key={file.id} onClick={() => onOpenFile(material.resource.id, file.id, file.fileName)}>Open {file.fileName}</button>)}</span>
  }

  const data = parseClassMaterial(material.notes)
  if (data?.format !== 'studyos-class-resource') {
    return <span>{material.notes}</span>
  }
  if (data.kind === 'YOUTUBE') {
    const videoUrl = getSafeYoutubeUrl(data.url, data.timestampSeconds)
    return videoUrl
      ? <span><a href={videoUrl} target="_blank" rel="noreferrer">{data.title || 'YouTube video'}</a><small>Starts at {data.timestampSeconds || 0}s</small></span>
      : <span>Video link unavailable</span>
  }
  return <span><strong>{data.title}</strong><small>{data.kind === 'CODE' ? 'Code material' : 'Class note'}</small><pre>{data.content}</pre></span>
}

function TeamFinder({ posts, currentUserId, onCreate, onEdit, onDelete, onJoin, onWithdraw, onRepost, onManageRequests, onOpenConversation, myApplications, myApplicationsLoading, showApplications, onToggleApplications }) {
  return <section className="team-page">
    <div className="page-heading"><div><p className="eyebrow">ACADEMIC COLLABORATION</p><h1>Team Finder</h1><p>Find thoughtful collaborators, or lead your own academic team.</p></div><div className="hero-actions"><button className="button secondary" onClick={() => onToggleApplications(!showApplications)}>{showApplications ? 'Browse opportunities' : 'My Applications'}</button><button className="button primary" onClick={onCreate}><Plus size={16} /> Create team post</button></div></div>
    {showApplications ? <MyTeamApplications applications={myApplications} loading={myApplicationsLoading} onWithdraw={onWithdraw} /> : <>
      <div className="team-intro"><div className="team-intro-icon"><UsersRound size={23} /></div><div><strong>Ready to lead?</strong><p>Post what you are working on, name the skills you need, and let the right teammates find you.</p></div><button className="button ghost" onClick={onCreate}>Start a team <ArrowRight size={14} /></button></div>
      <div className="team-toolbar"><strong>{posts.length ? `${posts.length} opportunities` : 'Open opportunities'}</strong><span>{posts.filter((post) => post.members < post.size).length} with space</span></div>
      {posts.length ? <div className="team-grid">{posts.map((post) => <TeamPost key={post.id} post={post} currentUserId={currentUserId} onEdit={onEdit} onDelete={onDelete} onJoin={onJoin} onWithdraw={onWithdraw} onRepost={onRepost} onManageRequests={onManageRequests} onOpenConversation={onOpenConversation} />)}</div> : <div className="team-empty"><UsersRound size={30} /><strong>No team opportunities yet</strong><p>Be the first leader to create an academic collaboration post.</p><button className="button primary" onClick={onCreate}><Plus size={16} /> Create team post</button></div>}
    </>}
  </section>
}

function MyTeamApplications({ applications, loading, onWithdraw }) {
  if (loading) return <p className="data-load-loading" role="status">Loading your applications…</p>
  if (!applications.length) return <div className="team-empty"><strong>No applications yet</strong><p>When you apply to a team, its status and deadline will appear here.</p></div>
  const statusLabels = { PENDING: 'Submitted', SHORTLISTED: 'Under review · shortlisted', ACCEPTED: 'Selected', REJECTED: 'Not selected', WITHDRAWN: 'Withdrawn' }
  return <div className="my-team-applications">{applications.map((application) => <article className="team-application-card" key={application.id}>
    <div className="team-application-card-header"><div><strong>{application.team.title}</strong><small>{application.roleAppliedFor || 'General Member'} · Submitted {new Date(application.createdAt).toLocaleDateString()}</small></div><span className="team-status">{statusLabels[application.status] || application.status}</span></div>
    <div className="team-post-meta"><span>Deadline: {application.deadline ? new Date(application.deadline).toLocaleDateString() : 'No deadline'}</span><span>{application.isExpired ? 'Applications closed' : 'Active recruitment'}</span></div>
    {['PENDING', 'SHORTLISTED'].includes(application.status) && <div className="post-actions"><button className="button secondary" onClick={() => onWithdraw(application.team.id, application.id)}>Withdraw application</button></div>}
    {application.status === 'ACCEPTED' && <p className="job-status">You have been selected; the team owner has enabled team chat access.</p>}
  </article>)}</div>
}

function TeamPost({ post, currentUserId, onEdit, onDelete, onJoin, onWithdraw, onRepost, onManageRequests, onOpenConversation }) {
  const skills = String(post.skills || '').split(',').map((skill) => skill.trim()).filter(Boolean)
  const initials = (post.creatorName || 'Student').split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()
  const isOwner = post.creatorId === currentUserId
  const isMember = post.memberships?.some((member) => member.userId === currentUserId)
  const ownRequest = post.requests?.[0]
  const requestPending = ['PENDING', 'SHORTLISTED'].includes(ownRequest?.status)
  const full = post.size > 0 && post.members >= post.size
  const expired = Boolean(post.isExpired)
  const roles = Array.isArray(post.roles) ? post.roles : []
  const rolesAvailable = roles.some((role) => role.openings > (post.acceptedRoleCounts?.[role.title] || 0))
  return <article className="team-post"><div className="team-post-top"><span className="type-pill">{post.type.replaceAll('_', ' ')}</span><span className={`team-status ${full || expired ? 'full' : ''}`}>{expired ? 'Expired' : full ? 'Full' : 'Open'}</span></div><h2>{post.title}</h2><p className="team-description">{post.description}</p>{post.requirements && <p className="team-description"><strong>Requirements:</strong> {post.requirements}</p>}
    {roles.length > 0 && <div className="team-role-list">{roles.map((role) => { const filled = post.acceptedRoleCounts?.[role.title] || 0; return <div className="team-role-item" key={role.title}><strong>{role.title}</strong><span>{Math.max(0, role.openings - filled)} of {role.openings} openings left</span>{role.requiredSkills && <small>Skills: {role.requiredSkills}</small>}{role.responsibilities && <small>Responsibilities: {role.responsibilities}</small>}</div> })}</div>}
    <div className="skill-list">{skills.length ? skills.map((skill) => <span key={skill}>{skill}</span>) : <span>Open to collaboration</span>}</div><div className="team-post-meta"><span><UsersRound size={14} /> {post.members} / {post.size}</span><span>{post.deadline ? `Apply by ${new Date(post.deadline).toLocaleDateString()}` : 'No application deadline'}</span></div><div className="team-post-footer"><div className="team-leader"><span className="avatar small">{initials}</span><span><strong>{post.creatorName}</strong><small>Team creator</small></span></div><div className="post-actions">{isOwner ? <>{expired && !full && <button className="button secondary" onClick={() => onRepost(post.id)}>Repost for 7 days</button>}<button className="button ghost" onClick={() => onOpenConversation('TEAM', post.id)}>Chat</button><button className="button ghost" onClick={() => onManageRequests(post)}>Applications</button><button className="icon-button" aria-label="Edit team post" title="Edit team post" onClick={() => onEdit(post)}><Pencil size={14} /></button><button className="icon-danger" onClick={() => onDelete(post.id)} aria-label="Delete team post" title="Delete team post"><Trash2 size={15} /></button></> : isMember ? <button className="button ghost" onClick={() => onOpenConversation('TEAM', post.id)}>Open team chat</button> : requestPending ? <button className="button secondary" onClick={() => onWithdraw(post.id, ownRequest.id)}>Withdraw application</button> : ownRequest?.status === 'ACCEPTED' ? <span className="team-status">Selected · joined</span> : <button className="button primary" disabled={full || expired || !rolesAvailable} onClick={() => onJoin(post.id)}>{expired ? 'Applications closed' : full ? 'Team full' : !rolesAvailable ? 'Roles filled' : ownRequest?.status === 'REJECTED' ? 'Apply again' : 'Request to join'} <ArrowRight size={14} /></button>}</div></div></article> }

function TeamPostForm({ team, onSubmit, saving }) {
  const initialRoles = Array.isArray(team?.roles) && team.roles.length
    ? team.roles
    : [{ title: '', responsibilities: team?.requirements || '', requiredSkills: team?.reqSkills || '', openings: Math.max(1, (team?.teamSize || 4) - 1) }]
  const [roles, setRoles] = useState(initialRoles.map((role) => ({ ...role })))
  const [roleError, setRoleError] = useState('')
  const submit = (event) => {
    event.preventDefault()
    const size = Number(new FormData(event.currentTarget).get('size') || 4)
    if (roles.reduce((total, role) => total + Number(role.openings || 0), 0) > size - 1) {
      setRoleError('Role openings must fit within team capacity after the creator is counted.')
      return
    }
    setRoleError('')
    onSubmit(event, roles.map((role) => ({
      title: role.title.trim(),
      responsibilities: role.responsibilities.trim(),
      requiredSkills: role.requiredSkills.trim(),
      openings: Number(role.openings),
    })))
  }
  const updateRole = (index, field, value) => setRoles((current) => current.map((role, i) => i === index ? { ...role, [field]: value } : role))
  return <form className="modal-form" onSubmit={submit}>
    <div className="form-row"><label>Post title<input name="title" required maxLength={160} defaultValue={team?.title || ''} placeholder="e.g. Need a React + AWS teammate" /></label><label>Collaboration type<select name="type" defaultValue={team?.type || 'HACKATHON'}><option value="HACKATHON">Hackathon</option><option value="GROUP_PROJECT">Group project</option><option value="PPT_PRESENTATION">PPT presentation</option><option value="RESEARCH">Research</option><option value="COLLEGE_PROJECT">College project</option><option value="COMPETITION">Competition</option><option value="OTHER">Other</option></select></label></div>
    <label>What are you building?<textarea name="description" required maxLength={5000} defaultValue={team?.description || ''} placeholder="Share the goal and context." /></label>
    <div className="form-row"><label>Team size, including you<select name="size" defaultValue={team?.teamSize || 4}>{[2, 3, 4, 5, 6, 8].map((size) => <option key={size} value={size}>{size} members</option>)}</select></label><label>Deadline<input name="deadline" type="date" defaultValue={team?.deadline ? new Date(team.deadline).toISOString().slice(0, 10) : ''} /></label></div>
    <div className="team-role-editor"><div className="panel-heading"><div><h3>Structured roles and openings</h3><p>Define responsibilities, required skills and available positions for each role.</p></div><button type="button" className="button secondary" disabled={roles.length >= 15} onClick={() => setRoles((current) => [...current, { title: '', responsibilities: '', requiredSkills: '', openings: 1 }])}><Plus size={14} /> Add role</button></div>
      {roles.map((role, index) => <fieldset className="team-role-item" key={index}><legend>Role {index + 1}</legend><label>Role title<input required maxLength={120} value={role.title} onChange={(event) => updateRole(index, 'title', event.target.value)} placeholder="e.g. Frontend developer" /></label><div className="form-row"><label>Required skills<input maxLength={1000} value={role.requiredSkills} onChange={(event) => updateRole(index, 'requiredSkills', event.target.value)} placeholder="React, TypeScript" /></label><label>Number of openings<input type="number" min="1" max="50" required value={role.openings} onChange={(event) => updateRole(index, 'openings', Number(event.target.value))} /></label></div><label>Responsibilities<textarea maxLength={2000} value={role.responsibilities} onChange={(event) => updateRole(index, 'responsibilities', event.target.value)} placeholder="Describe what this role will own." /></label>{roles.length > 1 && <button type="button" className="button ghost" onClick={() => setRoles((current) => current.filter((_, i) => i !== index))}>Remove role</button>}</fieldset>)}
    </div>
    <label>Additional requirements<textarea name="requirements" maxLength={5000} defaultValue={team?.requirements || ''} placeholder="Availability, background, or other requirements" /></label>
    {roleError && <p className="form-error" role="alert">{roleError}</p>}
    <div className="modal-actions"><button className="button primary" type="submit" disabled={saving}><UsersRound size={16} /> {saving ? 'Publishing…' : team ? 'Save changes' : 'Publish team post'}</button></div>
  </form>
}

function TeamApplicationForm({ post, profile, skills, onSubmit }) {
  const [saving, setSaving] = useState(false)
  const identity = profile?.academicIdentity || {}
  const profileInfo = profile?.profile || {}
  const savedSkills = skills.map((skill) => skill.name).filter(Boolean).join(', ')

  const submit = async (event) => {
    event.preventDefault()
    if (saving) return
    const form = new FormData(event.currentTarget)
    const application = Object.fromEntries([
      'role', 'college', 'branch', 'semesterYear', 'introduction', 'skills', 'experience',
      'projects', 'motivation', 'contribution', 'responsibilities', 'availability', 'schedule',
    ].map((field) => [field, String(form.get(field) || '').trim()]))
    setSaving(true)
    try {
      await onSubmit(post.id, application)
    } finally {
      setSaving(false)
    }
  }

  return <form className="modal-form" onSubmit={submit}>
    <div className="modal-note"><strong>{post.title}</strong><p>{post.requirements || post.reqSkills || 'Review the project description and explain how you can contribute.'}</p></div>
    <div className="team-application-profile"><span className="avatar">{(profileInfo.fullName || profile.name || 'S').slice(0, 2).toUpperCase()}</span><div><strong>{profileInfo.fullName || profile.name || 'Your StudyOS profile'}</strong><small>Application is submitted using your signed-in account.</small></div></div>
    <label>Preferred role<select name="role" required defaultValue=""><option value="" disabled>Select a role</option>{(post.roles || []).map((role) => { const remaining = Math.max(0, role.openings - (post.acceptedRoleCounts?.[role.title] || 0)); return <option key={role.title} value={role.title} disabled={!remaining}>{role.title}{remaining ? ` · ${remaining} opening${remaining === 1 ? '' : 's'}` : ' · filled'}</option> })}</select></label>
    <div className="form-row">
      <label>College / university<input name="college" maxLength={200} defaultValue={identity.institution || ''} placeholder="Your institution" /></label>
      <label>Branch / department<input name="branch" maxLength={120} defaultValue={identity.branch || profileInfo.department || ''} placeholder="e.g. Computer Science" /></label>
    </div>
    <label>Semester / year<input name="semesterYear" maxLength={80} defaultValue={identity.semester || identity.year || profileInfo.semester || ''} placeholder="e.g. Semester 5 / Third year" /></label>
    <label>Short introduction<textarea name="introduction" maxLength={1200} placeholder="Tell the team a little about yourself." /></label>
    <label>Relevant skills and technologies<input name="skills" required maxLength={1000} defaultValue={savedSkills} placeholder="React, Figma, user research" /></label>
    <label>Experience and relevant projects<textarea name="experience" maxLength={2000} placeholder="Describe relevant experience and your role." /></label>
    <label>Projects, coursework, research or hackathon work<textarea name="projects" maxLength={2000} placeholder="Share relevant work and links if useful." /></label>
    <label>Why do you want to join this project?<textarea name="motivation" maxLength={2000} placeholder="What interests you about this project?" /></label>
    <label>What will you contribute to this team?<textarea name="contribution" required maxLength={2000} placeholder="Describe the project-specific contribution you can make." /></label>
    <label>Responsibilities you are comfortable handling<textarea name="responsibilities" maxLength={1200} placeholder="List relevant tasks or responsibilities." /></label>
    <div className="form-row">
      <label>Weekly availability<input name="availability" maxLength={500} placeholder="e.g. 6 hours per week" /></label>
      <label>Preferred working schedule<input name="schedule" maxLength={300} placeholder="e.g. Weekday evenings" /></label>
    </div>
    <div className="modal-actions"><button className="button primary" type="submit" disabled={saving}>{saving ? 'Submitting…' : 'Submit application'}</button></div>
  </form>
}

function RecruiterNotes({ requestId, value, onSave }) {
  const [notes, setNotes] = useState(value || '')
  const [saving, setSaving] = useState(false)
  const submit = async (event) => {
    event.preventDefault()
    setSaving(true)
    try {
      await onSave(requestId, notes)
    } finally {
      setSaving(false)
    }
  }
  return <form className="recruiter-notes" onSubmit={submit}><label>Private recruiter notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={3000} placeholder="Only the recruitment owner can see these notes." /></label><button className="button ghost" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save private notes'}</button></form>
}

function TeamApplicationReview({ team, requests, onDecision, onSaveNotes, onOpenProfile, decidingRequestId, notice, onOpenChat }) {
  const statusLabels = { PENDING: 'Submitted', SHORTLISTED: 'Under review · shortlisted', ACCEPTED: 'Selected', REJECTED: 'Not selected', WITHDRAWN: 'Withdrawn' }
  const pending = requests.filter((request) => ['PENDING', 'SHORTLISTED'].includes(request.status)).length
  const selected = requests.filter((request) => request.status === 'ACCEPTED').length

  return <div className="team-application-review">
    {notice && (
      <div className={`team-review-notice ${notice.type === 'error' ? 'notice-error' : 'notice-success'}`} role="alert">
        {notice.text}
      </div>
    )}
    <div className="market-stats"><div><strong>{requests.length}</strong><span>Applicants</span></div><div><strong>{pending}</strong><span>Pending review</span></div><div><strong>{selected}</strong><span>Selected</span></div></div>
    <p className="class-topic-empty">Applications are private to the recruitment owner. Selecting a candidate automatically confirms their team membership and unlocks team chat.</p>
    {requests.length ? requests.map((request) => {
      const answers = request.applicationData || {}
      const candidateProfile = request.user?.profile || {}
      const academic = request.user?.academicIdentity || {}
      const candidateName = candidateProfile.fullName || request.user?.name || 'Student'
      const candidateSkills = request.user?.skills?.map((entry) => entry.skill?.name).filter(Boolean) || []
      const candidateUserId = request.userId || request.user?.id
      const isAlreadyMember = Boolean(
        request.status === 'ACCEPTED' ||
        (team.memberships && team.memberships.some((m) => m.userId === candidateUserId))
      )
      const isCurrentDeciding = decidingRequestId === request.id
      const isAnyDeciding = Boolean(decidingRequestId)

      return <article className="team-application-card" key={request.id}>
        <div className="team-application-card-header">
          <span className="avatar">{(candidateName || 'S').slice(0, 2).toUpperCase()}</span>
          <div>
            <strong>{candidateName}</strong>
            <small>{request.roleAppliedFor || 'Role not specified'} · Submitted {new Date(request.createdAt).toLocaleDateString()}</small>
          </div>
          {isAlreadyMember ? (
            <span className="team-status accepted-badge">✓ Selected · Team Member</span>
          ) : request.status === 'SHORTLISTED' ? (
            <span className="team-status shortlisted-badge">★ Shortlisted</span>
          ) : request.status === 'REJECTED' ? (
            <span className="team-status rejected-badge">Not selected</span>
          ) : (
            <span className="team-status">{statusLabels[request.status] || 'Under review'}</span>
          )}
        </div>
        {academic.isPublic && <button type="button" className="button ghost" onClick={() => onOpenProfile(request.user?.id || candidateUserId)}>View public profile <ExternalLink size={13} /></button>}
        <div className="team-application-facts">
          {(academic.institution || answers.college) && <span><strong>College:</strong> {academic.institution || answers.college}</span>}
          {(academic.branch || candidateProfile.department || answers.branch) && <span><strong>Branch:</strong> {academic.branch || candidateProfile.department || answers.branch}</span>}
          {(academic.semester || academic.year || candidateProfile.semester || answers.semesterYear) && <span><strong>Semester/year:</strong> {academic.semester || academic.year || candidateProfile.semester || answers.semesterYear}</span>}
        </div>
        {candidateSkills.length > 0 && <p><strong>Profile skills:</strong> {candidateSkills.join(', ')}</p>}
        {[
          ['Introduction', answers.introduction],
          ['Skills and technologies', answers.skills],
          ['Experience', answers.experience],
          ['Relevant projects', answers.projects],
          ['Motivation', answers.motivation],
          ['Project contribution', answers.contribution],
          ['Responsibilities', answers.responsibilities],
          ['Weekly availability', answers.availability],
          ['Preferred schedule', answers.schedule],
        ].filter(([, value]) => value).map(([label, value]) => <p key={label}><strong>{label}:</strong> {value}</p>)}

        {['PENDING', 'SHORTLISTED', 'ACCEPTED'].includes(request.status) && (
          <RecruiterNotes requestId={request.id} value={request.recruiterNotes} onSave={onSaveNotes} />
        )}

        {isAlreadyMember ? (
          <div className="post-actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#059669', fontWeight: 600 }}>Active team member with chat access</span>
            {onOpenChat && (
              <button type="button" className="button ghost" onClick={() => onOpenChat(team.id)}>
                <MessageSquare size={13} /> Open team chat
              </button>
            )}
          </div>
        ) : request.status === 'PENDING' ? (
          <div className="post-actions">
            <button
              type="button"
              className="button secondary"
              disabled={isAnyDeciding}
              onClick={() => onDecision('SHORTLISTED', request.id)}
            >
              {isCurrentDeciding ? 'Saving…' : 'Shortlist'}
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={isAnyDeciding}
              onClick={() => onDecision('REJECTED', request.id)}
            >
              Reject
            </button>
            <button
              type="button"
              className="button primary"
              disabled={isAnyDeciding || team.isExpired}
              onClick={() => onDecision('ACCEPTED', request.id)}
            >
              {isCurrentDeciding ? 'Selecting…' : 'Select candidate'}
            </button>
          </div>
        ) : request.status === 'SHORTLISTED' ? (
          <div className="post-actions">
            <button
              type="button"
              className="button secondary"
              disabled={isAnyDeciding}
              onClick={() => onDecision('PENDING', request.id)}
            >
              {isCurrentDeciding ? 'Updating…' : 'Move to pending'}
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={isAnyDeciding}
              onClick={() => onDecision('REJECTED', request.id)}
            >
              Reject
            </button>
            <button
              type="button"
              className="button primary"
              disabled={isAnyDeciding || team.isExpired}
              onClick={() => onDecision('ACCEPTED', request.id)}
            >
              {isCurrentDeciding ? 'Selecting…' : 'Select candidate'}
            </button>
          </div>
        ) : request.status === 'REJECTED' ? (
          <div className="post-actions">
            <button
              type="button"
              className="button ghost"
              disabled={isAnyDeciding}
              onClick={() => onDecision('SHORTLISTED', request.id)}
            >
              {isCurrentDeciding ? 'Updating…' : 'Reconsider candidate'}
            </button>
          </div>
        ) : null}
      </article>
    }) : <p className="notification-empty">No applications have been submitted for this recruitment post yet.</p>}
  </div>
}

function HelpRequestForm({ service, onSubmit, onCancel }) {
  const [saving, setSaving] = useState(false)
  const submit = async (event) => {
    event.preventDefault()
    if (saving) return
    const form = new FormData(event.currentTarget)
    const details = Object.fromEntries(['message', 'triedSoFar', 'projectContext', 'expectedOutcome', 'preferredDate', 'communicationMethod']
      .map((field) => [field, String(form.get(field) || '').trim()]))
    setSaving(true)
    try {
      await onSubmit(service.id, details)
    } finally {
      setSaving(false)
    }
  }
  return <form className="modal-form" onSubmit={submit}>
    <div className="modal-note"><strong>{service.title}</strong><p>{service.description}</p></div>
    <label>What help do you need?<textarea name="message" required maxLength={4000} placeholder="Describe the specific support you need." /></label>
    <label>What have you tried so far?<textarea name="triedSoFar" maxLength={2000} placeholder="Share the steps or resources you have already tried." /></label>
    <label>Course / project context<input name="projectContext" maxLength={1000} placeholder="Course, assignment, or project context" /></label>
    <label>Expected outcome<textarea name="expectedOutcome" maxLength={1200} placeholder="What would a successful outcome look like?" /></label>
    <div className="form-row">
      <label>Preferred date<input name="preferredDate" type="date" /></label>
      <label>Preferred communication<select name="communicationMethod" defaultValue="StudyOS chat"><option>StudyOS chat</option><option>Video call</option><option>In person</option><option>Discuss with provider</option></select></label>
    </div>
    <div className="modal-actions"><button type="button" className="button secondary" disabled={saving} onClick={onCancel}>Cancel</button><button className="button primary" type="submit" disabled={saving}>{saving ? 'Sending…' : 'Send help request'}</button></div>
  </form>
}

function HelpServiceForm({ service, onSubmit, saving, onCancel }) {
  const [paid, setPaid] = useState(Boolean(service?.isPaid))
  return <form key={service?.id || 'new-help-service'} className="modal-form" onSubmit={onSubmit}>
    <label>Service title<input name="title" required maxLength={160} defaultValue={service?.title || ''} placeholder="e.g. React dashboard code review" /></label>
    <div className="form-row"><label>Academic category<select name="category" defaultValue={service?.category || 'TUTORING'}>{['PPT_DESIGN', 'UI_UX', 'PDF_FORMATTING', 'CODE_REVIEW', 'DEBUGGING_GUIDANCE', 'TUTORING', 'MENTORING', 'RESEARCH_GUIDANCE', 'DOCUMENTATION', 'PROJECT_GUIDANCE', 'OTHER'].map((category) => <option key={category} value={category}>{category.replaceAll('_', ' ')}</option>)}</select></label><label>Skills<input name="skills" maxLength={1000} defaultValue={service?.skills || ''} placeholder="React, Figma" /></label></div>
    <label>Detailed service description<textarea name="description" required maxLength={5000} defaultValue={service?.description || ''} placeholder="Explain what you can help with, your approach and what the student will receive." /></label>
    <label>Deliverables<textarea name="deliverables" maxLength={2000} defaultValue={service?.deliverables || ''} placeholder="What will the requester receive?" /></label>
    <div className="form-row"><label>Availability<input name="availability" maxLength={500} defaultValue={service?.availability || ''} placeholder="Weekday evenings" /></label><label>Preferred schedule<input name="preferredSchedule" maxLength={300} defaultValue={service?.preferredSchedule || ''} placeholder="Weekdays after 5pm" /></label></div>
    <div className="form-row"><label>Expected response time<input name="responseTime" maxLength={200} defaultValue={service?.responseTime || ''} placeholder="Within 24 hours" /></label><label>Expected timeline<input name="expectedTimeline" maxLength={300} defaultValue={service?.expectedTimeline || ''} placeholder="2-3 days" /></label></div>
    <div className="form-row"><label>Arrangement<select name="paymentType" value={paid ? 'PAID' : 'FREE'} onChange={(event) => setPaid(event.target.value === 'PAID')}><option value="FREE">Free</option><option value="PAID">Paid directly</option></select></label>{paid && <label>Price<input name="price" type="number" min="0" step="0.01" defaultValue={service?.price ?? ''} /></label>}</div>
    {paid && <><div className="form-row"><label>Payment method<select name="paymentMethod" defaultValue={service?.paymentMethod || ''}><option value="">Discuss directly</option><option value="UPI">UPI</option><option value="CASH">Cash</option></select></label><label>UPI ID<input name="upiId" defaultValue={service?.upiId || ''} placeholder="name@bank" /></label></div><label>QR image URL<input name="paymentQrUrl" type="url" defaultValue={service?.paymentQrUrl || ''} placeholder="https://..." /></label><label>Payment instructions<textarea name="paymentInstructions" defaultValue={service?.paymentInstructions || ''} placeholder="Optional direct-payment details" /></label><div className="modal-note">Payments happen directly between students. StudyOS does not process or confirm payments.</div></>}
    <div className="modal-actions"><button type="button" className="button secondary" disabled={saving} onClick={onCancel}>Cancel</button><button className="button primary" type="submit" disabled={saving}><Plus size={16} /> {saving ? 'Saving…' : service ? 'Save service' : 'Post service'}</button></div>
  </form>
}

function ReviewForm({ request, onSubmit, onClose }) {
  const [saving, setSaving] = useState(false)
  const submit = async (event) => {
    event.preventDefault()
    if (saving) return
    const form = new FormData(event.currentTarget)
    setSaving(true)
    try {
      await onSubmit(request.id, { rating: Number(form.get('rating')), comment: String(form.get('comment') || '').trim() })
    } finally {
      setSaving(false)
    }
  }
  return <form className="modal-form review-form" onSubmit={submit}>
    <p>How was your completed help interaction with {request.provider?.name || 'the provider'} for “{request.service?.title || 'this service'}”?</p>
    <fieldset className="rating-picker" aria-required="true"><legend>Choose a rating from one to five stars</legend>{[1, 2, 3, 4, 5].map((rating) => <label key={rating}><input type="radio" name="rating" value={rating} required /><span aria-hidden="true">★</span><span className="sr-only">{rating} {rating === 1 ? 'star' : 'stars'}</span></label>)}</fieldset>
    <label>Written review (optional)<textarea name="comment" maxLength={2000} placeholder="Share what worked well or what could improve." /></label>
    <div className="modal-actions"><button type="button" className="button secondary" disabled={saving} onClick={onClose}>Cancel</button><button className="button primary" type="submit" disabled={saving}>{saving ? 'Submitting…' : 'Submit review'}</button></div>
  </form>
}

function SkillsMarketplace({ jobs, skills, helpRequests, currentUserId, onAddSkill, onUpdateSkill, onRemoveSkill, onCreate, onEdit, onClaim, onUpdateRequest, onRateRequest, onDelete, onOpenConversation, onOpenProfile, updatingRequestId }) {
  const openJobs = jobs.filter((job) => job.status === 'OPEN').length
  const activeJobs = helpRequests.filter((request) => ['ACCEPTED', 'IN_PROGRESS'].includes(request.status)).length
  return <section className="skills-page">
    <div className="page-heading"><div><p className="eyebrow">STUDENT SERVICES MARKETPLACE</p><h1>Skills & Help</h1><p>Post work you need done, or earn by helping another student move forward.</p></div><button className="button primary" onClick={onCreate}><Plus size={16} /> Offer a service</button></div>
    <div className="market-stats"><div><strong>{openJobs}</strong><span>Available services</span></div><div><strong>{activeJobs}</strong><span>Active interactions</span></div><div><strong>Direct</strong><span>Student-to-student payment</span></div></div>
    <section className="profile-skills"><div><strong>My skills</strong><p>Share proficiency, relevant experience and an optional work sample.</p></div>
      <form className="profile-skill-form" onSubmit={onAddSkill}><label>Skill<input name="skill" required maxLength={80} placeholder="e.g. React development" /></label><label>Proficiency<select name="proficiency" defaultValue="BEGINNER"><option value="BEGINNER">Beginner</option><option value="INTERMEDIATE">Intermediate</option><option value="ADVANCED">Advanced</option><option value="EXPERT">Expert</option></select></label><label style={{ gridColumn: '1 / -1' }}>Experience<textarea name="experience" maxLength={1200} placeholder="Describe your experience with this skill." /></label><label>Portfolio link<input name="portfolioUrl" type="url" maxLength={500} placeholder="https://..." /></label><button className="button secondary" type="submit" style={{ height: 'max-content' }}><Plus size={14} /> Add skill</button></form>
      <div className="skill-profile-list">{skills.length ? skills.map((skill) => <form className="skill-profile-card" key={skill.id} onSubmit={(event) => onUpdateSkill(event, skill.id)}><div className="skill-profile-heading"><strong>{skill.name}</strong><button type="button" className="icon-danger" aria-label={`Remove ${skill.name}`} onClick={() => onRemoveSkill(skill.id)}><X size={12} /></button></div><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}><label>Proficiency<select name="proficiency" defaultValue={skill.proficiency || 'BEGINNER'}><option value="BEGINNER">Beginner</option><option value="INTERMEDIATE">Intermediate</option><option value="ADVANCED">Advanced</option><option value="EXPERT">Expert</option></select></label><label>Portfolio link<input name="portfolioUrl" type="url" maxLength={500} defaultValue={skill.portfolioUrl || ''} placeholder="https://..." /></label></div><label>Experience<textarea name="experience" maxLength={1200} defaultValue={skill.experience || ''} placeholder="Describe your experience." /></label><button className="button ghost" type="submit">Save skill profile</button></form>) : <p className="class-topic-empty">No skills added yet.</p>}</div>
    </section>
    <div className="market-toolbar"><div><strong>Browse help services</strong><p>Find work that matches what you know.</p></div><span>Ratings are based on completed, verified interactions</span></div>
    {jobs.length ? <div className="job-grid">{jobs.map((job) => <JobCard key={job.id} job={job} currentUserId={currentUserId} helpRequest={helpRequests.find((request) => request.serviceId === job.id && request.requesterId === currentUserId)} onClaim={onClaim} onEdit={onEdit} onDelete={onDelete} onOpenProfile={onOpenProfile} />)}</div> : <div className="team-empty job-empty"><Sparkles size={30} /><strong>No help services yet</strong><p>Offer the first academic service to help another student.</p><button className="button primary" onClick={onCreate}><Plus size={16} /> Offer a service</button></div>}
    <section className="help-request-list">
      <div className="market-toolbar"><div><strong>My help interactions</strong><p>Requests you made or received.</p></div></div>
      {helpRequests.length ? helpRequests.map((request) => (
        <HelpRequestRow
          key={request.id}
          request={request}
          currentUserId={currentUserId}
          onTransition={onUpdateRequest}
          onRate={onRateRequest}
          onOpenConversation={onOpenConversation}
          onOpenProfile={onOpenProfile}
          updatingRequestId={updatingRequestId}
        />
      )) : <p className="class-topic-empty">No help interactions yet.</p>}
    </section>
  </section>
}

function JobCard({ job, currentUserId, helpRequest, onClaim, onEdit, onDelete, onOpenProfile }) {
  const isOwner = job.providerId === currentUserId
  const closedRequest = ['CANCELLED', 'REJECTED'].includes(helpRequest?.status)
  const requestLabel = helpRequest ? helpRequest.status.replace(/_/g, ' ').toLowerCase() : ''
  return <article className="job-card"><div className="job-top"><span className="type-pill">{job.categoryLabel}</span><span className="job-status" aria-label={`${job.ratingCount || 0} persisted reviews${job.ratingCount ? `, average ${job.averageRating.toFixed(1)} out of 5` : ''}`}>{job.ratingCount ? `${job.averageRating.toFixed(1)} ★ · ${job.ratingCount} review${job.ratingCount === 1 ? '' : 's'}` : 'No reviews yet'}</span></div><h2>{job.title}</h2><p className="job-description">{job.description}</p>{job.deliverables && <p className="job-description"><strong>Deliverables:</strong> {job.deliverables}</p>}<div className="job-skill"><Sparkles size={14} /> <strong>{job.skills || 'General help'}</strong></div><div className="job-details"><span><BriefcaseBusiness size={14} /> {job.budget}{job.paymentMethod ? ` · ${job.paymentMethod}` : ''}</span><span><Clock3 size={14} /> {job.expectedTimeline || job.availability || 'Flexible schedule'}</span></div>{(job.preferredSchedule || job.responseTime) && <div className="job-details">{job.preferredSchedule && <span>Schedule: {job.preferredSchedule}</span>}{job.responseTime && <span>Response: {job.responseTime}</span>}</div>}<div className="job-footer"><div><button type="button" className="profile-link-button" disabled={isOwner || !job.providerId} onClick={() => onOpenProfile(job.providerId)}>{job.provider?.name || 'Student'}</button><small>{job.availability || 'Academic help service'}</small></div><div className="post-actions">{!isOwner && job.providerId && <button className="button ghost" onClick={() => onOpenProfile(job.providerId)}>View profile</button>}{isOwner ? <><button className="icon-button" aria-label="Edit help service" title="Edit service" onClick={() => onEdit(job)}><Pencil size={14} /></button><button className="icon-danger" aria-label="Delete help service" title="Delete service" onClick={() => onDelete(job.id)}><Trash2 size={15} /></button></> : helpRequest && !closedRequest ? <span className="job-status">{requestLabel}</span> : <button className="button primary" onClick={() => onClaim(job.id)}>Request help <ArrowRight size={14} /></button>}</div></div></article>
}

function HelpRequestRow({ request, currentUserId, onTransition, onRate, onOpenConversation, onOpenProfile, updatingRequestId }) {
  const isProvider = String(request.providerId) === String(currentUserId)
  const isRequester = String(request.requesterId) === String(currentUserId)
  const otherParty = isProvider ? request.requester?.name : request.provider?.name
  const isUpdating = updatingRequestId === request.id

  const actions = []
  if (isProvider) {
    if (request.status === 'PENDING') {
      actions.push(['ACCEPTED', 'Accept'], ['REJECTED', 'Reject'])
    } else if (request.status === 'ACCEPTED') {
      actions.push(['IN_PROGRESS', 'Start interaction'], ['CANCELLED', 'Cancel'])
    } else if (request.status === 'IN_PROGRESS') {
      actions.push(['COMPLETED', 'Mark complete'], ['CANCELLED', 'Cancel'])
    }
  } else if (isRequester) {
    if (['PENDING', 'ACCEPTED', 'IN_PROGRESS'].includes(request.status)) {
      actions.push(['CANCELLED', 'Cancel request'])
    }
  }

  const statusBadge = () => {
    switch (request.status) {
      case 'PENDING':
        return <span className="team-status" style={{ background: '#fef3c7', color: '#92400e' }}>Pending review</span>
      case 'ACCEPTED':
        return <span className="team-status" style={{ background: '#dcfce7', color: '#166534' }}>✓ Accepted</span>
      case 'IN_PROGRESS':
        return <span className="team-status" style={{ background: '#e0e7ff', color: '#3730a3' }}>In progress</span>
      case 'COMPLETED':
        return <span className="team-status" style={{ background: '#f3e8ff', color: '#6b21a8' }}>✓ Completed</span>
      case 'REJECTED':
        return <span className="team-status" style={{ background: '#fee2e2', color: '#991b1b' }}>Declined</span>
      case 'CANCELLED':
        return <span className="team-status" style={{ background: '#f1f5f9', color: '#64748b' }}>Cancelled</span>
      default:
        return <span className="team-status">{request.status.replace(/_/g, ' ')}</span>
    }
  }

  return <article className="help-request-row">
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
        <strong>{request.service?.title || 'Help service'}</strong>
        {statusBadge()}
      </div>
      <p>
        {isProvider ? 'Requested by' : 'Offered by'}{' '}
        <button
          className="profile-link-button"
          type="button"
          disabled={isProvider ? !request.requesterId : !request.providerId}
          onClick={() => onOpenProfile(isProvider ? request.requesterId : request.providerId)}
        >
          {otherParty || 'Student'}
        </button>
        {request.createdAt && <span> · {new Date(request.createdAt).toLocaleDateString()}</span>}
      </p>
      <details className="help-request-details">
        <summary>Request details</summary>
        {request.message && <p><strong>Help needed:</strong> {request.message}</p>}
        {request.triedSoFar && <p><strong>Already tried:</strong> {request.triedSoFar}</p>}
        {request.projectContext && <p><strong>Context:</strong> {request.projectContext}</p>}
        {request.expectedOutcome && <p><strong>Expected outcome:</strong> {request.expectedOutcome}</p>}
        {request.preferredDate && <p><strong>Preferred date:</strong> {new Date(request.preferredDate).toLocaleDateString()}</p>}
        {request.communicationMethod && <p><strong>Communication:</strong> {request.communicationMethod}</p>}
      </details>
    </div>
    <div className="post-actions">
      {actions.map(([status, label]) => (
        <button
          key={status}
          className={status === 'REJECTED' || status === 'CANCELLED' ? 'button secondary' : 'button primary'}
          disabled={Boolean(updatingRequestId)}
          onClick={() => onTransition(request.id, status)}
        >
          {isUpdating ? 'Updating…' : label}
        </button>
      ))}
      {['ACCEPTED', 'IN_PROGRESS', 'COMPLETED'].includes(request.status) && (
        <button
          className="button ghost"
          onClick={() => onOpenConversation('HELP_REQUEST', request.id)}
          title="Open private conversation"
        >
          <MessageSquare size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
          Open conversation
        </button>
      )}
      {request.status === 'COMPLETED' && !isProvider && !request.review && (
        <button className="button primary" onClick={() => onRate(request.id)}>
          Rate service
        </button>
      )}
      {request.review && <span className="job-status">Rated {request.review.rating}/5</span>}
    </div>
  </article>
}

function ProjectsPage({ projects, labs, currentUserId, onCreateProject, onEditProject, onDeleteProject, onCreateLab, onEditLab, onDeleteLab, onOpenFile, onDownloadLab, onOpenProfile }) {
  const [tab, setTab] = useState('projects')
  const [expandedLabId, setExpandedLabId] = useState(null)

  return (
    <section className="projects-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ACADEMIC WORKSPACE</p>
          <h1>Projects & Lab Repository</h1>
          <p>Document and showcase your software projects and share course documents in the Lab Repository.</p>
        </div>
        <div className="hero-actions">
          {tab === 'projects' ? (
            <button className="button primary" onClick={onCreateProject}><Plus size={16} /> Add Project</button>
          ) : (
            <button className="button primary" onClick={onCreateLab}><Plus size={16} /> Upload Document</button>
          )}
        </div>
      </div>

      <div className="projects-tab-bar">
        <button className={`tab-button ${tab === 'projects' ? 'active' : ''}`} onClick={() => setTab('projects')}>
          <FolderKanban size={15} style={{ verticalAlign: 'middle', marginRight: 6 }} /> Projects ({projects.length})
        </button>
        <button className={`tab-button ${tab === 'labs' ? 'active' : ''}`} onClick={() => setTab('labs')}>
          <Code2 size={15} style={{ verticalAlign: 'middle', marginRight: 6 }} /> Lab Repository ({labs.length})
        </button>
      </div>

      {tab === 'projects' ? (
        projects.length ? (
          <div className="team-grid">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                currentUserId={currentUserId}
                onEdit={onEditProject}
                onDelete={onDeleteProject}
                onOpenFile={onOpenFile}
                onOpenProfile={onOpenProfile}
              />
            ))}
          </div>
        ) : (
          <div className="team-empty">
            <FolderKanban size={32} />
            <strong>No academic projects yet</strong>
            <p>Publish course projects, capstone prototypes, or research software to build your portfolio.</p>
            <button className="button primary" onClick={onCreateProject}><Plus size={16} /> Add project</button>
          </div>
        )
      ) : (
        labs.length ? (
          <div className="lab-list">
            {labs.map((lab) => (
              <LabCard
                key={lab.id}
                lab={lab}
                currentUserId={currentUserId}
                isExpanded={expandedLabId === lab.id}
                onToggle={() => setExpandedLabId((curr) => curr === lab.id ? null : lab.id)}
                onEdit={onEditLab}
                onDelete={onDeleteLab}
                onDownload={onDownloadLab}
                onOpenProfile={onOpenProfile}
              />
            ))}
          </div>
        ) : (
          <div className="team-empty">
            <FileText size={32} />
            <strong>No documents uploaded</strong>
            <p>Upload PDF or Word course documents with a clear name and description.</p>
            <button className="button primary" onClick={onCreateLab}><Plus size={16} /> Upload document</button>
          </div>
        )
      )}
    </section>
  )
}

function ProjectCard({ project, currentUserId, onEdit, onDelete, onOpenFile, onOpenProfile }) {
  const isOwner = project.creatorId === currentUserId

  return (
    <article className="project-card">
      <div className="team-post-top">
        <span className="type-pill">{project.categoryLabel}</span>
        {project.visibility !== 'PUBLIC' && <span className="type-pill">Private</span>}
      </div>
      <h2>{project.title}</h2>
      {project.description && <p className="team-description">{project.description}</p>}
      {project.technology && (
        <div className="project-tech">
          <Sparkles size={13} /> <span>{project.technology}</span>
        </div>
      )}
      {project.tags?.length > 0 && (
        <div className="skill-list">
          {project.tags.map((tag) => <span key={tag}>{tag}</span>)}
        </div>
      )}
      {(project.githubUrl || project.demoUrl) && (
        <div className="project-links">
          {project.githubUrl && (
            <a href={project.githubUrl} target="_blank" rel="noreferrer">
              <ExternalLink size={13} /> GitHub Repository
            </a>
          )}
          {project.demoUrl && (
            <a href={project.demoUrl} target="_blank" rel="noreferrer">
              <ExternalLink size={13} /> Live Demo
            </a>
          )}
        </div>
      )}
      {project.files?.length > 0 && (
        <div className="project-files">
          {project.files.map((file) => (
            <button key={file.id} className="button ghost" onClick={() => onOpenFile(project.id, file.id, file.fileName)}>
              <Download size={13} /> {file.fileName}
            </button>
          ))}
        </div>
      )}
      <div className="team-post-footer" style={{ marginTop: 'auto' }}>
        <div className="team-leader">
          <span className="avatar small">{project.creatorName.slice(0, 2).toUpperCase()}</span>
          <span>
            <button className="profile-link-button" type="button" disabled={isOwner || !project.creatorId} onClick={() => onOpenProfile(project.creatorId)}>{project.creatorName}</button>
            <small>{project.createdAt ? new Date(project.createdAt).toLocaleDateString() : 'Academic Project'}</small>
          </span>
        </div>
        {isOwner && (
          <div className="post-actions">
            <button className="icon-button" aria-label="Edit project" title="Edit project" onClick={() => onEdit(project)}><Pencil size={14} /></button>
            <button className="icon-danger" aria-label="Delete project" title="Delete project" onClick={() => onDelete(project.id)}><Trash2 size={15} /></button>
          </div>
        )}
      </div>
    </article>
  )
}

function LabDocumentForm({ lab, saving, progress, onSubmit, onCancel }) {
  const [file, setFile] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const acceptFile = (nextFile) => {
    if (!nextFile) return
    const extension = nextFile.name.split('.').pop()?.toLowerCase()
    if (!['pdf', 'doc', 'docx'].includes(extension)) {
      setError('Choose a PDF, DOC, or DOCX document.')
      setFile(null)
      return
    }
    if (nextFile.size > 10 * 1024 * 1024) {
      setError('Documents must be 10 MB or smaller.')
      setFile(null)
      return
    }
    setError('')
    setFile(nextFile)
  }
  const submit = async (event) => {
    event.preventDefault()
    if (!lab && !file) {
      setError('Choose or drop a document to upload.')
      return
    }
    setError('')
    await onSubmit(event, file)
  }
  return <form className="modal-form" onSubmit={submit}>
    <label>Document Name<input name="name" required maxLength={200} defaultValue={lab?.name || ''} placeholder="e.g. Operating Systems Lab Manual" /></label>
    <label>Description<textarea name="description" required maxLength={3000} defaultValue={lab?.description || ''} placeholder="Describe this document and what it contains." /></label>
    <label className={`lab-drop-zone ${dragging ? 'is-dragging' : ''}`} onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); acceptFile(event.dataTransfer.files[0]) }}>
      <span>Upload Document</span>
      <input name="file" type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={saving} onChange={(event) => acceptFile(event.target.files?.[0])} />
      <small>Drop a file here or choose a file · PDF, DOC, DOCX · maximum 10 MB</small>
      {lab?.fileName && <small>Current file: {lab.fileName}. Select a replacement or leave blank to keep it.</small>}
      {file && <small className="lab-selected-file">{file.name} · {(file.size / (1024 * 1024)).toFixed(2)} MB</small>}
      {file && <button type="button" className="button ghost lab-remove-file" disabled={saving} onClick={(event) => { event.preventDefault(); event.stopPropagation(); setFile(null); setError('') }}>Remove selected file</button>}
    </label>
    {saving && <div className="lab-upload-progress"><progress max="100" value={progress} aria-label="Document upload progress" /><span>{progress}% uploaded</span></div>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="modal-actions"><button type="button" className="button secondary" disabled={saving} onClick={onCancel}>Cancel</button><button className="button primary" type="submit" disabled={saving}><Plus size={16} /> {saving ? 'Uploading…' : lab ? 'Save document' : 'Upload document'}</button></div>
  </form>
}

function LabCard({ lab, currentUserId, isExpanded, onToggle, onEdit, onDelete, onDownload, onOpenProfile }) {
  const isDocument = Boolean(lab.fileReference)
  const isOwner = Boolean(lab.uploaderId && lab.uploaderId === currentUserId)
  return (
    <article className="lab-card">
      <div className="lab-header">
        <span className="lab-badge">{isDocument ? (lab.fileMimeType === 'application/pdf' ? 'PDF document' : 'Word document') : `Experiment #${lab.experimentNo ?? '—'}`}</span>
        {lab.subjectId && <span className="type-pill">{lab.subjectId}</span>}
        <div className="post-actions" style={{ marginLeft: 'auto' }}>
          {isDocument && <button className="button ghost" onClick={() => onDownload(lab.id, lab.fileName)}><Download size={14} /> Download</button>}
          {!isDocument && <button className="button ghost" onClick={onToggle}>{isExpanded ? 'Hide Details' : 'View Code & Aim'}</button>}
          {isOwner && <><button className="icon-button" aria-label="Edit repository document" title="Edit document" onClick={() => onEdit(lab)}><Pencil size={14} /></button><button className="icon-danger" aria-label="Delete repository document" title="Delete document" onClick={() => onDelete(lab.id)}><Trash2 size={15} /></button></>}
        </div>
      </div>
      <h3>{lab.name}</h3>
      {lab.description && <p>{lab.description}</p>}
      {isDocument && <small>{lab.uploader?.id ? <button className="profile-link-button" onClick={() => onOpenProfile(lab.uploader.id)}>{lab.uploader.name || 'Student'}</button> : (lab.uploader?.name || 'Student')} · {new Date(lab.createdAt).toLocaleDateString()} · {lab.fileName}{Number.isFinite(lab.fileSize) ? ` · ${(lab.fileSize / (1024 * 1024)).toFixed(2)} MB` : ''}</small>}
      {lab.aim && <p><strong>Aim:</strong> {lab.aim}</p>}
      {isExpanded && (
        <div className="lab-details">
          {lab.procedure && <p><strong>Procedure:</strong><br />{lab.procedure}</p>}
          {lab.code && (
            <div>
              <strong>Source Code:</strong>
              <pre className="lab-code-block">{lab.code}</pre>
            </div>
          )}
          {lab.output && (
            <div>
              <strong>Output:</strong>
              <pre className="lab-code-block" style={{ background: '#252e42' }}>{lab.output}</pre>
            </div>
          )}
        </div>
      )}
    </article>
  )
}

function AccountSettings() {
  const { user, profile: globalProfile, session, reloadProfile } = useAuth();
  const identity = globalProfile?.academicIdentity || {};
  const campusProfile = globalProfile?.profile || {};
  const institution = globalProfile?.Institution || {};
  const student = globalProfile?.student || {};
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState({
    name: campusProfile?.fullName || globalProfile?.name || user?.user_metadata?.name || '',
    avatarUrl: campusProfile?.avatarUrl || globalProfile?.avatarUrl || '',
    rollNumber: campusProfile?.rollNumber || student?.rollNumber || '',
    section: campusProfile?.section || student?.section?.name || '',
    department: campusProfile?.department || student?.section?.department?.name || identity.branch || '',
    institution: campusProfile?.institution || identity.institution || institution.name || institution.code || '',
    semester: campusProfile?.semester || student?.semester || identity.semester || '',
    year: campusProfile?.year || identity.year || '3rd Year',
    residency: campusProfile?.residency || 'DAY_SCHOLAR',
    gender: campusProfile?.gender || identity.gender || 'Prefer not to say',
    tonePreference: identity.tonePreference || 'buddy',
    bio: campusProfile?.bio || '',
    skills: campusProfile?.skills || (Array.isArray(globalProfile?.skills) ? globalProfile.skills.map((s) => s.name).join(', ') : '') || '',
    experience: campusProfile?.experience || '',
    github: campusProfile?.github || identity.github || '',
    linkedin: campusProfile?.linkedin || identity.linkedin || '',
    portfolio: campusProfile?.portfolio || identity.portfolio || '',
    isPublic: Boolean(identity.isPublic ?? campusProfile?.isPublic ?? true),
  });

  const [institutions, setInstitutions] = useState([]);
  const [customInstitutionMode, setCustomInstitutionMode] = useState(false);

  useEffect(() => {
    let active = true;
    apiRequest('/institutions', { token: session?.access_token })
      .then((res) => {
        if (!active) return;
        const list = Array.isArray(res) ? res : res?.institutions || [];
        setInstitutions(list);
      })
      .catch((err) => {
        console.warn('Could not load institutions in AccountSettings:', err);
      });
    return () => {
      active = false;
    };
  }, [session?.access_token]);

  useEffect(() => {
    const ident = globalProfile?.academicIdentity || {};
    const cp = globalProfile?.profile || {};
    const inst = globalProfile?.Institution || {};
    const st = globalProfile?.student || {};
    const currentInst = cp.institution || ident.institution || inst.name || inst.code || '';
    setProfile({
      name: cp.fullName || globalProfile?.name || user?.user_metadata?.name || '',
      avatarUrl: cp.avatarUrl || globalProfile?.avatarUrl || '',
      rollNumber: cp.rollNumber || st.rollNumber || '',
      section: cp.section || st.section?.name || '',
      department: cp.department || st.section?.department?.name || ident.branch || '',
      institution: currentInst,
      semester: cp.semester || st.semester || ident.semester || '',
      year: cp.year || ident.year || '3rd Year',
      residency: cp.residency || 'DAY_SCHOLAR',
      gender: cp.gender || ident.gender || 'Prefer not to say',
      tonePreference: ident.tonePreference || 'buddy',
      bio: cp.bio || '',
      skills: cp.skills || (Array.isArray(globalProfile?.skills) ? globalProfile.skills.map((s) => s.name).join(', ') : '') || '',
      experience: cp.experience || '',
      github: cp.github || ident.github || '',
      linkedin: cp.linkedin || ident.linkedin || '',
      portfolio: cp.portfolio || ident.portfolio || '',
      isPublic: Boolean(ident.isPublic ?? cp.isPublic ?? true),
    });
  }, [globalProfile, user]);

  const update = (event) => setProfile((current) => ({
    ...current,
    [event.target.name]: event.target.type === 'checkbox' ? event.target.checked : event.target.value,
  }));

  const save = async (event) => {
    event.preventDefault();
    if (!user) return;
    setSaving(true);
    setError('');
    try {
      await apiRequest(`/profile/${user.id}`, {
        method: 'PUT',
        body: profile,
        token: session?.access_token,
      });
      await reloadProfile();
      setSaved(true);
      setTimeout(() => setSaved(false), 2200);
    } catch (saveError) {
      console.error('Failed to save profile:', saveError);
      setError(saveError.message || 'Unable to save your profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const initialName = profile.name ? profile.name.substring(0, 2).toUpperCase() : 'ST';
  const nameParts = (profile.name || '').split(' ');
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';

  return (
    <section className="account-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">PERSONAL WORKSPACE</p>
          <h1>Account & Settings</h1>
          <p>Manage your academic identity and experience.</p>
        </div>
        {saved && <span className="save-status" role="status">Saved successfully</span>}
        {error && <span className="auth-error" role="alert">{error}</span>}
      </div>
      <div className="account-layout">
        <form className="account-panel profile-panel" onSubmit={save}>
          <div className="panel-heading">
            <div className="profile-avatar">{initialName}</div>
            <div>
              <h2>Academic profile</h2>
              <p>This information is linked to your StudyOS account.</p>
            </div>
          </div>
          <div className="account-fields">
            <label>
              First name
              <input
                name="firstName"
                value={firstName}
                onChange={(e) => setProfile({ ...profile, name: [e.target.value, lastName].filter(Boolean).join(' ') })}
                maxLength={60}
              />
            </label>
            <label>
              Last name
              <input
                name="lastName"
                value={lastName}
                onChange={(e) => setProfile({ ...profile, name: [firstName, e.target.value].filter(Boolean).join(' ') })}
                maxLength={60}
              />
            </label>
            <label>
              Email
              <input name="email" value={user?.email || ''} readOnly aria-readonly="true" />
            </label>
            <label>
              Roll Number
              <input
                name="rollNumber"
                value={profile.rollNumber}
                onChange={update}
                placeholder="e.g. 21BCE1042"
              />
            </label>
            <label>
              College / Institution
              {institutions.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                  <select
                    value={
                      customInstitutionMode
                        ? '__CUSTOM__'
                        : institutions.find(
                            (i) =>
                              i.name?.toLowerCase() === (profile.institution || '').trim().toLowerCase() ||
                              i.code?.toLowerCase() === (profile.institution || '').trim().toLowerCase()
                          )
                        ? institutions.find(
                            (i) =>
                              i.name?.toLowerCase() === (profile.institution || '').trim().toLowerCase() ||
                              i.code?.toLowerCase() === (profile.institution || '').trim().toLowerCase()
                          ).id
                        : profile.institution
                        ? '__CUSTOM__'
                        : ''
                    }
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '__CUSTOM__') {
                        setCustomInstitutionMode(true);
                      } else if (val) {
                        setCustomInstitutionMode(false);
                        const inst = institutions.find((i) => i.id === val);
                        if (inst) {
                          setProfile((current) => ({ ...current, institution: inst.name }));
                        }
                      } else {
                        setCustomInstitutionMode(false);
                        setProfile((current) => ({ ...current, institution: '' }));
                      }
                    }}
                  >
                    <option value="">-- Select your institution --</option>
                    {institutions.map((inst) => (
                      <option key={inst.id} value={inst.id}>
                        {inst.name} ({inst.code})
                      </option>
                    ))}
                    <option value="__CUSTOM__">Other / Enter manually...</option>
                  </select>

                  {customInstitutionMode && (
                    <input
                      name="institution"
                      value={profile.institution}
                      onChange={update}
                      placeholder="Enter custom college / university name"
                      autoFocus
                    />
                  )}
                </div>
              ) : (
                <input
                  name="institution"
                  value={profile.institution}
                  onChange={update}
                  placeholder="e.g. Stanford University"
                />
              )}
            </label>
            <label>
              Department / Branch
              <input
                name="department"
                value={profile.department}
                onChange={update}
                placeholder="e.g. Computer Science & Engineering"
              />
            </label>
            <label>
              Section
              <input
                name="section"
                value={profile.section}
                onChange={update}
                placeholder="e.g. Section A"
              />
            </label>
            <label>
              Current Semester
              <select name="semester" value={profile.semester || '6'} onChange={update}>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                  <option key={s} value={String(s)}>
                    Semester {s}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Academic Year
              <select name="year" value={profile.year || '3rd Year'} onChange={update}>
                <option value="1st Year">1st Year</option>
                <option value="2nd Year">2nd Year</option>
                <option value="3rd Year">3rd Year</option>
                <option value="4th Year">4th Year</option>
                <option value="5th Year">5th Year</option>
              </select>
            </label>
            <label>
              Living arrangement
              <select name="residency" value={profile.residency || 'DAY_SCHOLAR'} onChange={update}>
                <option value="DAY_SCHOLAR">🎒 Day Scholar</option>
                <option value="HOSTELER">🏠 Hostel Resident</option>
              </select>
            </label>
            <label>
              Gender (Optional)
              <select name="gender" value={profile.gender || 'Prefer not to say'} onChange={update}>
                <option value="Prefer not to say">Prefer not to say</option>
                <option value="Boy">Boy</option>
                <option value="Girl">Girl</option>
                <option value="Another identity">Another identity</option>
              </select>
            </label>
            <label>
              Message Tone Preference
              <select name="tonePreference" value={profile.tonePreference || 'buddy'} onChange={update}>
                <option value="buddy">Buddy (Friendly & encouraging)</option>
                <option value="bro">Bro (Casual hustle: "You're golden bro!")</option>
                <option value="baddie">Baddie (Empowering: "Slaying baddie!")</option>
                <option value="neutral">Neutral (Formal)</option>
              </select>
            </label>
            <label className="account-field-full">
              Short bio
              <textarea
                name="bio"
                value={profile.bio || ''}
                onChange={update}
                maxLength={500}
                placeholder="Brief bio about your academic focus and interests."
              />
            </label>
            <label className="account-field-full">
              Skills (comma separated)
              <input
                name="skills"
                value={profile.skills || ''}
                onChange={update}
                maxLength={200}
                placeholder="e.g. Python, React, Algorithms, UI Design"
              />
            </label>
            <label className="account-field-full">
              Experience / Projects
              <textarea
                name="experience"
                value={profile.experience || ''}
                onChange={update}
                maxLength={500}
                placeholder="Key project highlights, internships, or academic experience."
              />
            </label>
            <label>
              Portfolio URL
              <input
                name="portfolio"
                type="url"
                value={profile.portfolio || ''}
                onChange={update}
                placeholder="https://..."
              />
            </label>
            <label>
              GitHub URL
              <input
                name="github"
                type="url"
                value={profile.github || ''}
                onChange={update}
                placeholder="https://github.com/..."
              />
            </label>
            <label>
              LinkedIn URL
              <input
                name="linkedin"
                type="url"
                value={profile.linkedin || ''}
                onChange={update}
                placeholder="https://linkedin.com/in/..."
              />
            </label>
            <label className="profile-visibility-toggle">
              <input
                type="checkbox"
                name="isPublic"
                checked={profile.isPublic}
                onChange={update}
              />
              <span>Public profile visible in StudyOS search and directory</span>
            </label>
          </div>
          <div className="panel-footer">
            <span>{user ? `Connected to ${user.email}` : 'Not connected'}</span>
            <button className="button primary" type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
function Stat({ label, value, icon: Icon, tone }) { return <div className="stat-card"><div><p>{label}</p><strong className={tone}>{value}</strong></div><span className={`stat-icon ${tone}`}><Icon size={18} /></span></div> }
function SectionHeader({ title, action, onClick }) { return <div className="section-header"><h2>{title}</h2>{onClick && <button onClick={onClick}>{action} <ArrowRight size={14} /></button>}</div> }
function ClassCard({ item, large }) { const Icon = item.icon || BookOpen; const progress = Number(item.progress) || 0; return <div className={`class-card ${large ? 'large-card' : ''}`}><div className={`class-icon ${item.color}`}><Icon size={19} /></div><strong>{item.title}</strong><p>{item.topicCount ?? item.topics?.length ?? 0} topics · {item.resourceCount ?? 0} resources</p><div className="progress-label"><span>{progress}% completed</span><span>{progress === 0 ? 'Not started' : progress < 30 ? 'Getting started' : 'In progress'}</span></div><div className="progress"><i className={item.color} style={{ width: `${progress}%` }}></i></div></div> }
function ResourceList({ resources, onNavigate }) { return <div className="resource-list">{resources.map((item) => <article className="resource-row" key={item.id}><div className={`resource-thumb ${item.color || 'purple'}`}><FileText size={17} /></div><div className="resource-main"><strong>{item.title}</strong><p>{item.type || 'Resource'} · {item.subjectLabel || item.subject || 'General'} · {item.creatorName}</p></div><span className="rating" aria-label={`${item.ratingCount || 0} ratings`}>{item.ratingCount ? <><Star size={13} fill="currentColor" /> {item.averageRating.toFixed(1)} · {item.ratingCount}</> : 'Not rated'}</span><button className="button ghost" onClick={onNavigate}>Open Vault</button></article>)}</div> }
function Activity({ resources = [] }) {
  if (!resources.length) {
    return <div className="activity-list"><div className="empty-state compact"><Library size={22} /><strong>No recent activity</strong><p>New uploads and team activity will appear here.</p></div></div>
  }

  return <div className="activity-list">{resources.slice(0, 4).map((resource) => <ActivityItem key={resource.id} icon={FileText} tone="purple" text="New resource added" detail={resource.title} time={resource.createdAt ? new Date(resource.createdAt).toLocaleDateString() : 'Recently'} />)}</div>
}
function ActivityItem({ icon: Icon, tone, text, detail, time }) { return <div className="activity-item"><span className={`activity-icon ${tone}`}><Icon size={15} /></span><div><strong>{text}</strong><p>{detail}</p><small>{time}</small></div></div> }
function Modal({ title, onClose, children }) {
  const titleId = useId()
  const modalRef = useRef(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])
  useEffect(() => {
    const previousFocus = document.activeElement
    const modal = modalRef.current
    const focusable = () => [...(modal?.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])') || [])]
    focusable()[0]?.focus()
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onCloseRef.current()
      } else if (event.key === 'Tab') {
        const items = focusable()
        if (!items.length) return
        const first = items[0]
        const last = items[items.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      if (previousFocus instanceof HTMLElement) previousFocus.focus()
    }
  }, [])
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div ref={modalRef} className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}><div className="modal-header"><h2 id={titleId}>{title}</h2><button type="button" className="close-button" onClick={onClose} aria-label="Close"><X size={18} /></button></div>{children}</div></div>
}

function ReportResourceForm({ resource, saving, error, onSubmit, onCancel }) {
  const submit = (event) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    onSubmit({ reason: String(form.get('reason') || ''), description: String(form.get('description') || '').trim() })
  }
  return <form className="modal-form" onSubmit={submit}>
    <div className="modal-note"><strong>{resource.title}</strong><p>Reports are reviewed by the StudyOS moderation team.</p></div>
    <label>Reason for report<select name="reason" required defaultValue="INCORRECT"><option value="INCORRECT">Incorrect information</option><option value="BROKEN">Broken or unavailable</option><option value="SPAM">Spam</option><option value="COPYRIGHT">Copyright concern</option><option value="MISLEADING">Misleading content</option><option value="OTHER">Other</option></select></label>
    <label>Details (optional)<textarea name="description" maxLength={2000} placeholder="Add context to help moderators review this resource." /></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="modal-actions"><button type="button" className="button secondary" disabled={saving} onClick={onCancel}>Cancel</button><button className="button primary" type="submit" disabled={saving}>{saving ? 'Submitting…' : 'Submit report'}</button></div>
  </form>
}

function RateResourceModal({ resource, saving, error, onSubmit, onCancel }) {
  const [hoveredScore, setHoveredScore] = useState(0)
  const [selectedScore, setSelectedScore] = useState(5)

  const labels = {
    1: '1 star · Poor',
    2: '2 stars · Fair',
    3: '3 stars · Good',
    4: '4 stars · Very Good',
    5: '5 stars · Excellent',
  }

  const activeScore = hoveredScore || selectedScore

  const handleSubmit = (event) => {
    event.preventDefault()
    onSubmit(selectedScore)
  }

  return (
    <Modal title="Rate Resource" onClose={onCancel}>
      <form className="modal-form" onSubmit={handleSubmit}>
        <div className="modal-note">
          <strong>{resource?.title}</strong>
          <p>How helpful was this resource for your studies?</p>
        </div>

        <div className="rating-modal-stars">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              className={`star-rating-btn ${star <= activeScore ? 'active' : ''}`}
              onMouseEnter={() => setHoveredScore(star)}
              onMouseLeave={() => setHoveredScore(0)}
              onClick={() => setSelectedScore(star)}
              aria-label={`${star} star`}
            >
              <Star size={32} fill={star <= activeScore ? '#f59e0b' : 'none'} stroke={star <= activeScore ? '#f59e0b' : '#94a3b8'} />
            </button>
          ))}
        </div>

        <div className="rating-score-label">
          {labels[activeScore] || 'Select rating'}
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}

        <div className="modal-actions">
          <button type="button" className="button secondary" disabled={saving} onClick={onCancel}>
            Cancel
          </button>
          <button className="button primary" type="submit" disabled={saving || !selectedScore}>
            {saving ? 'Submitting…' : 'Submit rating'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function ResourceDetailModal({ resource, currentUserId, onOpenFile, onToggleSave, onRate, onReport, onOpenProfile, onClose }) {
  if (!resource) return null

  const isOwner = resource.creatorId === currentUserId || resource.creator?.id === currentUserId
  const isPrivate = resource.visibility && resource.visibility !== 'PUBLIC'
  const authorName = resource.creatorName || resource.creator?.name || 'Student'
  const authorId = resource.creator?.id || resource.creatorId

  return (
    <Modal title={resource.title || 'Resource details'} onClose={onClose}>
      <div className="resource-detail-modal-body">
        <div className="resource-detail-meta">
          <div className="resource-detail-meta-item">
            <strong>Subject</strong>
            <span>{resource.subjectLabel || resource.subject || 'General'}</span>
          </div>
          <div className="resource-detail-meta-item">
            <strong>Resource Type</strong>
            <span>{resource.type || 'NOTE'}</span>
          </div>
          <div className="resource-detail-meta-item">
            <strong>Shared by</strong>
            <span>
              <button
                type="button"
                className="profile-link-button"
                disabled={isOwner || !authorId}
                onClick={() => onOpenProfile(authorId)}
              >
                {authorName}
              </button>
            </span>
          </div>
          <div className="resource-detail-meta-item">
            <strong>Date Published</strong>
            <span>{resource.createdAt ? new Date(resource.createdAt).toLocaleDateString() : 'Recent'}</span>
          </div>
          <div className="resource-detail-meta-item">
            <strong>Rating</strong>
            <span>
              {resource.ratingCount ? (
                <>⭐ {resource.averageRating.toFixed(1)} ({resource.ratingCount} reviews)</>
              ) : (
                'Not rated yet'
              )}
            </span>
          </div>
          <div className="resource-detail-meta-item">
            <strong>Access & Price</strong>
            <span>
              {resource.price != null && resource.price > 0 ? (
                `₹${resource.price} · ${resource.paymentMethod || 'UPI'}`
              ) : (
                'Free'
              )}
            </span>
          </div>
        </div>

        {resource.description && (
          <div className="resource-detail-desc">
            {resource.description}
          </div>
        )}

        {resource.tags?.length > 0 && (
          <div className="skill-list" style={{ marginBottom: '14px' }}>
            {resource.tags.map((tag) => <span key={tag}>{tag}</span>)}
          </div>
        )}

        {resource.upiId && (
          <p className="class-topic-empty" style={{ margin: '0 0 12px 0' }}>
            UPI ID: <strong>{resource.upiId}</strong> {resource.paymentInst ? `· ${resource.paymentInst}` : ''}
          </p>
        )}

        {resource.files?.length > 0 && (
          <div className="resource-detail-files">
            <strong>Attached Files</strong>
            {resource.files.map((file) => (
              <div key={file.id} className="resource-detail-file-card">
                <div>
                  <strong>{file.fileName || 'Attachment'}</strong>
                  {file.fileSize && <small style={{ display: 'block', color: '#64748b' }}>{(file.fileSize / (1024 * 1024)).toFixed(2)} MB</small>}
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => onOpenFile(resource.id, file.id, file.fileName, 'preview')}
                  >
                    <BookOpen size={14} /> Preview
                  </button>
                  <button
                    type="button"
                    className="button primary"
                    onClick={() => onOpenFile(resource.id, file.id, file.fileName, 'download')}
                  >
                    <Download size={14} /> Download
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="modal-actions" style={{ marginTop: '16px' }}>
          <button
            type="button"
            className="button secondary"
            onClick={() => onToggleSave(resource.id)}
          >
            <Bookmark size={14} /> {resource.savedByUser ? 'Unsave' : 'Save resource'}
          </button>
          {!isOwner && !isPrivate && (
            <button
              type="button"
              className="button secondary"
              onClick={() => { onClose(); onRate(resource) }}
            >
              <Star size={14} /> Rate
            </button>
          )}
          {!isOwner && !isPrivate && (
            <button
              type="button"
              className="button secondary"
              onClick={() => { onClose(); onReport(resource.id) }}
            >
              Report
            </button>
          )}
          <button type="button" className="button primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default App
