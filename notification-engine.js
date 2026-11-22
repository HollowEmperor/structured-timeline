/**
 * Structured Visual Timeline — Background Notification Engine
 * Inspired by reverse-engineered Duolingo engagement architecture:
 * 4 Tones: Begging (🥺), Passive-Aggressive (🙄), Sweet (💖), Comforting (🌿)
 * Tailored specifically to:
 * - Cumulative Habit Target Model (completedDays / masteryDays)
 * - Day Compartment Boundaries (Dawn, Morning, Afternoon, Evening)
 * - Visual Timeline Tasks (Energy 1-5, Priority, Alert Start/End, Follow-ups)
 * - Daily Progress Rings (Physical, Mental, Gained)
 * - Inactivity Fatigue Protection (Reverse Psychology)
 */

(function () {
  'use strict';

  // =========================================================================
  // 152+ TAILORED NOTIFICATION TEMPLATES ACROSS 4 TONES & APP DOMAINS
  // =========================================================================
  const NOTIFICATION_POOLS = {
    // -----------------------------------------------------------------------
    // HABIT PROGRESS & EVENING CHECK-INS (70 templates)
    // -----------------------------------------------------------------------
    habits: {
      begging: [
        "Please, please, please! Just 5 minutes for {habit} 🥺 You're already {completed}/{target} in!",
        "I'm down on both knees begging you to log {habit} today! Don't leave me hanging! 😭",
        "Pleeease? Just one little session for {habit}? Look at these big puppy dog eyes 🥺",
        "You only have {remaining} sessions left to hit your goal! Please don't stop now! 🙏",
        "I promise it won't take long! Please log {habit} before you sleep! 🥺",
        "Look at me pleading on the floor! {habit} is sitting at {completed}/{target}, please log it! 😭",
        "Don't do this to me! Just one tap for {habit} today, pretty please with sprinkles? 🥺✨",
        "I'm holding back tears... {habit} has been waiting all day! Please complete session #{nextSession}! 😭",
        "Please say you haven't forgotten {habit}! We've come so far together ({completed} done)! 🥺",
        "One tiny effort for {habit}, I beg of you! Just {remaining} more to achieve mastery! 🙏",
        "I will literally do anything if you just log {habit} tonight... please! 🥺",
        "Can you hear my tiny notification cries? {habit} needs your check-in right now! 😭",
        "Please don't break our streak of progress! {habit} ({completed}/{target}) is calling your name! 🙏",
        "My heart is trembling... please don't skip {habit} today! Only {remaining} left! 🥺💔",
        "Pretty please? With a cherry on top? Just a quick session for {habit}! 🍒🥺",
      ],
      passiveAggressive: [
        "Oh, so we're just pretending {habit} doesn't exist today? Cool, cool, I'll just wait here.",
        "Look at {habit} sitting at {completed}/{target}... waiting for you... lonely... in the dark.",
        "I guess self-improvement takes days off. Must be nice 🙄",
        "Fine, ignore me. But those {remaining} remaining sessions aren't going to complete themselves.",
        "Oh, you had time for other apps, but not 5 minutes for {habit}? Noted. 👀",
        "Don't mind me, just watching your {habit} progress gather dust at {completed}/{target}.",
        "I thought we had goals? But sure, leaving {habit} unlogged is a choice.",
        "I see how it is. You and {habit} are taking a 'break'? Right. 🙄",
        "Just a reminder that {habit} is still at {completed}/{target}. In case you conveniently forgot.",
        "Should I reschedule {habit} for never? Because that's what today is looking like. 👀",
        "Your future self is giving you major side-eye right now over {habit}.",
        "Interesting strategy to reach {target} sessions by not doing any today. Let's see how that works.",
        "Sure, scroll past this notification. {habit} didn't want to get completed today anyway 😒",
        "I'll just add this to the list of things we planned to do today and didn't. {habit} sends its regards.",
        "At this rate, {habit} will reach {target} by the year 2040. Just saying.",
      ],
      sweet: [
        "Friendly little tap! Ready to add session #{nextSession} to your {habit} journey? ✨",
        "You're making real progress on {habit} ({completed}/{target})! So proud of your dedication 🌸",
        "A warm little reminder for {habit} 💖 Take your time and enjoy the flow.",
        "You've already conquered {completed} sessions of {habit}! Just {remaining} more to go ✨",
        "Hope you're having a beautiful day! Whenever you're ready, {habit} is waiting for you 🌷",
        "Sending gentle encouragement for {habit}! You've got this, one step at a time 💖",
        "Look at you go! {completed} check-ins on {habit} already in the books. Keep shining! ✨",
        "A little sprinkle of motivation for {habit} ({completed}/{target}) today 🌸",
        "Every session of {habit} makes you stronger. Ready for today's gentle check-in? 💫",
        "Just popping in with a smile! {habit} is ready whenever you are today 💖",
        "Small steps lead to big transformations. Wonderful progress on {habit} so far! 🌿✨",
        "You're building something wonderful with {habit} ({completed}/{target}). Take a bow! 🌸",
        "Sending you warmth and focus for your {habit} session today 💖",
        "Believe in your progress! {completed} down on {habit}, only {remaining} to milestone! ✨",
        "Treat yourself to 5 mindful minutes with {habit} today. You deserve this win! 🌷",
      ],
      comforting: [
        "Exhausting day? Don't force it if you can't. {habit} is right here whenever you're ready 🍵",
        "Every single session counts. You've already conquered {completed} sessions — be proud of that 🌿",
        "No guilt, no rush. Progress at your own pace is still genuine progress.",
        "Take a deep breath. Missing today doesn't erase the {completed} sessions you've achieved.",
        "Heavy day? Be gentle with yourself. {habit} isn't going anywhere 🌿",
        "Self-compassion comes first. If you have energy for {habit}, great; if not, rest well 🍵",
        "You are not behind. You are exactly where you need to be with {habit} ({completed}/{target}).",
        "Life happens. Don't worry about perfection; your {completed} completed sessions still stand proud 🌿",
        "Give yourself credit for showing up. Whenever you feel up to it, {habit} is waiting.",
        "Resting is productive too. If today was draining, let {habit} wait until tomorrow 🍵",
        "No streaks to break here. Your {completed} check-ins on {habit} are locked in forever 🌿",
        "Breathe out the tension. A tiny 2-minute effort on {habit} is enough if you're tired.",
        "Be proud of the journey. {completed} steps forward on {habit} is remarkable consistency 🌿",
        "Soft reminder: You are doing great. Take care of yourself first, {habit} second 🍵",
        "Sleep peacefully tonight. Your {completed} sessions on {habit} are safe and celebrated 🌙",
      ],
      nearMilestone: [
        "Only {remaining} sessions left! The finish line for {habit} is in sight! 🏆",
        "Almost at mastery! Just {remaining} more check-ins to reach {target} on {habit}! 🌟",
        "Can you feel it? {completed}/{target} done on {habit} — final stretch! 🚀",
        "You are on the brink of completing your {habit} goal! Only {remaining} to go! 🏅",
        "So close to victory! Just {remaining} sessions until {habit} is officially mastered! ✨",
        "Look at that milestone glowing! {completed} of {target} finished for {habit}! 🎯",
        "Don't stop now! Just {remaining} more sessions to celebrate your full {habit} mastery! 🥂",
        "Incredible determination! {completed}/{target} complete on {habit}. Let's bring it home! 🌟",
        "The last few steps are the most rewarding. Only {remaining} left for {habit}! 💫",
        "Mastery is within your grasp! Log session #{nextSession} of {target} on {habit} today! 🏆",
      ],
    },

    // -----------------------------------------------------------------------
    // COMPARTMENT TRANSITIONS (36 templates)
    // -----------------------------------------------------------------------
    compartments: {
      dawn: [
        "Dawn is breaking 🌅 Time for quiet ignition before the world wakes up.",
        "The world is soft and quiet. Sip some water and ease into your morning at your own rhythm 🌿",
        "Dawn window active (05:30). Fresh canvas, zero noise, pure potential ✨",
        "Early start! Set a gentle, steady intention for your day 🌅",
        "Peaceful dawn. Take three slow breaths and prepare your morning flow 🍵",
        "The sunrise is yours. Review your Dawn routine when you're ready 🌄",
      ],
      morning: [
        "Morning window is active (08:00)! {count} focus priorities lined up on your timeline ☀️",
        "Morning has arrived ✨ Time for sharp focus and steady momentum.",
        "Dawn wraps up; Morning begins. Lock into your highest-impact block today 🎯",
        "Rise and execute! Morning compartment open with {count} tasks ahead 🚀",
        "Morning session starting. Fuel up, hydrate, and conquer your first block! ⚡",
        "Fresh energy for the Morning window. Make today feel effortless and intentional ✨",
      ],
      afternoon: [
        "Afternoon compartment begins (12:00). Time for mid-day focus and steady pace 🌤️",
        "Morning is complete! Step into your Afternoon window with clear eyes 🎯",
        "Mid-day transition: Review your afternoon time blocks and stay grounded 🌿",
        "Afternoon energy: Take a quick stretch and tackle your next priority ☀️",
        "Half the day is carved out. Afternoon window active with {count} tasks remaining 💫",
        "Steady momentum into the Afternoon block. Keep your flow alive! ✨",
      ],
      evening: [
        "Evening already?! Please tell me you're checking off today's habits before bed! 🥺",
        "Evening compartment has started. Look at all those Afternoon tasks looking back at you 🙄",
        "Evening is here 🌙 Time to wind down, wrap up your sessions, and rest.",
        "Evening arrives. Whatever didn't get done today can wait. Be kind to yourself 🍵",
        "Sun is setting (17:30). Transition into Evening: review remaining tasks and habit check-ins 🌆",
        "Evening window open. Check off today's habits and prepare your evening cooldown 🕯️",
        "I'm begging you on my knees, don't leave your evening habits unlogged tonight! 😭",
        "Oh, you thought Evening meant complete freedom? Those {count} tasks say hello 🙄",
        "A peaceful evening to you 🌙 Wrap up what feels good, leave the rest for tomorrow 🌿",
        "Evening handoff: Transition from output to recovery. You did great today ✨",
        "Almost bedtime! Please just 5 minutes for your evening routine, pleeease? 🥺",
        "Evening reflection time: Review your wins and set yourself up for a serene night 🍵",
      ],
      night: [
        "Day complete (23:00). Check your timeline summary and get a wonderful night's rest 🌙",
        "Time to disconnect. The canvas is closed for tonight — recharge deeply 🌿",
        "Rest well tonight. Tomorrow is a brand new timeline waiting for your touch ✨",
        "Close your eyes and breathe easy. Your progress is locked in and celebrated 🛌",
        "Night has fallen. Put down the screens and give yourself the rest you earned 🕯️",
        "Sleep peacefully. You showed up today, and that's what truly counts 🌙",
      ],
    },

    // -----------------------------------------------------------------------
    // TIMELINE TASKS (36 templates: Start, End & Follow-ups)
    // -----------------------------------------------------------------------
    tasks: {
      start: [
        "Starting now: {task} ({time}) 🎯 Lock into your focus block!",
        "Timeline Alert: {task} begins right now. Step into the zone ⚡",
        "Focus block starting: {task}. Silence distractions and dive in 🚀",
        "Time for {task}! Your timeline is cleared and ready for action ✨",
        "Session begins: {task}. Give it your full, deliberate presence 🎯",
        "Action cue: {task} is starting now ({time}). You've got this! 💫",
      ],
      end: [
        "Handoff time: {task} is wrapping up ({time}). Transition smoothly to your next block!",
        "Session complete: {task} ends now. Take a breath and log any final notes 📝",
        "Timeline cue: {task} has reached its scheduled end. Step back and stretch 🌿",
        "Handoff window: Wrap up {task} and prepare for what's next ✨",
        "Block concluded: {task}. Great focus! Transition when ready 🎯",
        "Time's up for {task}! Mark it complete on your timeline and recharge 💫",
      ],
      followUp: {
        begging: [
          "Did you finish {task}?! Please tell me you finished it! I can't take the suspense! 🙏",
          "Please, please mark {task} done if you finished it! I'm waiting anxiously! 🥺",
          "I'm on my knees begging for an update on {task}! Did you conquer it? 😭",
          "Pleeease check off {task} on your timeline! Seeing it uncompleted hurts my soul 🥺",
          "Did you do it? Please tell me you did {task}! Give me the green checkmark! 🙏",
          "I'm biting my digital nails... is {task} finished? Please tap done! 🥺",
        ],
        passiveAggressive: [
          "Still working on {task}... or are we scrolling social media right now? 👀",
          "Oh, {task} started 30 minutes ago and isn't marked done? Must be very absorbing 🙄",
          "Just checking if {task} is still alive, or if we abandoned ship without telling me.",
          "Look at {task} sitting incomplete on your timeline. It knows what you're doing 👀",
          "I see {task} is still pending. Procrastination is an art, and you're Picasso today 🎨🙄",
          "Should I cancel {task}, or are you actually going to check it off today?",
        ],
        sweet: [
          "Hope {task} went smoothly! Don't forget to check it off your timeline 💖",
          "Checking in on {task} ✨ Pop in and mark it done whenever you're ready 🌸",
          "You're doing great! A quick tap to complete {task} will brighten your timeline 💫",
          "Gentle reminder to check off {task} if you've wrapped it up 💖",
          "Hope you found your flow during {task}! Mark it complete and celebrate ✨",
          "A sweet nudge for {task} 🌸 You're making beautiful progress today!",
        ],
        comforting: [
          "Take a deep breath. If {task} took longer than expected, that's completely okay 🌿",
          "No rush on {task}. Work at your own rhythm — quality over speed always 🍵",
          "Stuck on {task}? Step away for 2 minutes, grab some water, and come back fresh 🌿",
          "Progress is progress, even if {task} is taking extra time. Be kind to yourself.",
          "No pressure at all. Mark {task} done whenever you wrap it up — you're in control 🍵",
          "Deep breath. You're handling {task} one step at a time, and that's enough 🌿",
        ],
      },
    },

    // -----------------------------------------------------------------------
    // DAILY PROGRESS RINGS (10 templates)
    // -----------------------------------------------------------------------
    rings: [
      "Our daily rings are so close to closing! Just a little push on Mental & Physical! 🥺⭕",
      "Look at that Gained ring... sitting at {pct}%... looking at you sadly 🙄",
      "2 out of 3 rings already glowing! You're having a wonderfully balanced day ✨",
      "Don't worry about closing all 3 rings today. Any ring progress is a victory 🌿",
      "Please close our rings before midnight! I'm begging you, we're at {pct}%! 😭⭕",
      "Ring check-in: Physical and Mental rings are calling your name before evening ends 💫",
      "Your daily rings are lighting up! Finish strong and watch them glow complete ✨",
      "One more task pushes your Mental ring to 100%! Ready for the final burst? 🎯",
      "Halfway to full ring closure! Take a moment to log remaining sessions today ⭕",
      "No guilt over open rings. You gave today real effort, and that's what matters 🌿",
    ],

    // -----------------------------------------------------------------------
    // INACTIVITY & FATIGUE PROTECTION (10 templates: Reverse Psychology)
    // -----------------------------------------------------------------------
    fatigue: [
      "These reminders don't seem to be working. We'll stop bothering you for now... (unless you come back?) 👀",
      "We're taking a break from nudging you. Your timeline will be waiting whenever you're ready 🌿",
      "I see you've been away for a few days. No guilt, no lectures — just warm welcome whenever you return 🍵",
      "Taking time off is healthy too. Whenever you want to structure your day, we're right here ✨",
      "Fine, you win! The silence begins now... unless you secretly miss logging your habits? 🙄",
      "Ghosting your own timeline? Bold move. We'll pause notifications until you check in again 👀",
      "Sending you peace and space. Rest up and return when inspiration strikes 🌿",
      "We've gone quiet on purpose. Take all the time you need; your progress is safe with us 🍵",
      "Welcome back whenever you're ready! Zero judgment, 100% support ✨",
      "Notification pause initiated. We believe in you — see you when you're ready to flow again 🌸",
    ],
  };

  // =========================================================================
  // HELPER UTILITIES
  // =========================================================================
  function pickRandom(arr) {
    if (!arr || arr.length === 0) return '';
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function formatTemplate(template, vars) {
    return template.replace(/\{(\w+)\}/g, (_, key) => {
      return vars[key] !== undefined ? vars[key] : '';
    });
  }

  function getLocalNotificationsPlugin() {
    if (typeof window !== 'undefined' && window.Capacitor && window.Capacitor.Plugins) {
      return window.Capacitor.Plugins.LocalNotifications || null;
    }
    return null;
  }

  // =========================================================================
  // NOTIFICATION ENGINE API
  // =========================================================================
  const StructuredNotificationEngine = {
    CHANNELS: {
      URGENT: 'structured_urgent',
      ROUTINE: 'structured_routine',
    },

    /**
     * Initialize high importance and routine notification channels on Android
     */
    async initChannels() {
      const plugin = getLocalNotificationsPlugin();
      if (!plugin || !plugin.createChannel) return;
      try {
        await plugin.createChannel({
          id: this.CHANNELS.URGENT,
          name: 'Urgent Alarms & Streak Savers',
          description: 'High-priority alerts for task start times and evening habit checks',
          importance: 5,
          visibility: 1,
          vibration: true,
        });

        await plugin.createChannel({
          id: this.CHANNELS.ROUTINE,
          name: 'Compartment & Focus Reminders',
          description: 'Gentle transitions for day compartments and focus check-ins',
          importance: 3,
          visibility: 1,
          vibration: false,
        });
      } catch (err) {
        console.warn('[NotificationEngine] Channel setup error:', err);
      }
    },

    /**
     * Request native Android notification permissions
     */
    async requestPermissions() {
      const plugin = getLocalNotificationsPlugin();
      if (!plugin || !plugin.requestPermissions) return { display: 'granted' };
      try {
        const res = await plugin.requestPermissions();
        return res;
      } catch (err) {
        console.warn('[NotificationEngine] Permission request error:', err);
        return { display: 'denied' };
      }
    },

    /**
     * Schedule a single local notification through Capacitor
     */
    async schedule(options) {
      const plugin = getLocalNotificationsPlugin();
      if (!plugin || !plugin.schedule) {
        // Fallback: log for debugging if outside Capacitor
        console.log('[NotificationEngine] Local fallback schedule:', options);
        return;
      }
      try {
        await plugin.schedule({
          notifications: [
            {
              id: options.id || Math.floor(Math.random() * 1000000),
              title: options.title,
              body: options.body,
              schedule: { at: options.at },
              channelId: options.channelId || this.CHANNELS.ROUTINE,
              extra: options.extra || {},
            },
          ],
        });
      } catch (err) {
        console.warn('[NotificationEngine] Schedule error:', err);
      }
    },

    /**
     * Cancel all previously scheduled notifications
     */
    async cancelAll() {
      const plugin = getLocalNotificationsPlugin();
      if (!plugin) return;
      try {
        const pending = await plugin.getPending();
        if (pending && pending.notifications && pending.notifications.length > 0) {
          await plugin.cancel({ notifications: pending.notifications });
        }
      } catch (err) {
        console.warn('[NotificationEngine] Cancel error:', err);
      }
    },

    /**
     * Generate dynamic copy for a habit using one of the 4 tones
     */
    getHabitNotificationCopy(habit, tone) {
      const completed = habit.completedDays || 0;
      const target = habit.masteryDays || 21;
      const remaining = Math.max(0, target - completed);
      const nextSession = completed + 1;
      const vars = {
        habit: habit.title || 'Habit',
        completed,
        target,
        remaining,
        nextSession,
      };

      if (remaining <= 3 && remaining > 0 && Math.random() < 0.4) {
        return {
          title: `Milestone Alert: ${habit.title}`,
          body: formatTemplate(pickRandom(NOTIFICATION_POOLS.habits.nearMilestone), vars),
        };
      }

      const selectedTone = tone || ['begging', 'passiveAggressive', 'sweet', 'comforting'][Math.floor(Math.random() * 4)];
      const template = pickRandom(NOTIFICATION_POOLS.habits[selectedTone] || NOTIFICATION_POOLS.habits.sweet);

      const tonePrefixes = {
        begging: '🥺 Pleading Check-in',
        passiveAggressive: '👀 Just Saying...',
        sweet: '✨ Habit Progress',
        comforting: '🌿 Gentle Reminder',
      };

      return {
        title: `${tonePrefixes[selectedTone] || '✨'} • ${habit.title}`,
        body: formatTemplate(template, vars),
      };
    },

    /**
     * Generate dynamic copy for a compartment transition
     */
    getCompartmentTransitionCopy(compartmentId, upcomingTasksCount = 0) {
      const vars = { count: upcomingTasksCount };
      const pool = NOTIFICATION_POOLS.compartments[compartmentId] || NOTIFICATION_POOLS.compartments.morning;
      const template = pickRandom(pool);

      const titles = {
        dawn: '🌅 Dawn Ignition Begins',
        morning: '☀️ Morning Window Active',
        afternoon: '🌤️ Afternoon Focus Starts',
        evening: '🌙 Evening Transition',
        night: '🛌 Day Wrap-Up & Rest',
      };

      return {
        title: titles[compartmentId] || 'Timeline Window Transition',
        body: formatTemplate(template, vars),
      };
    },

    /**
     * Generate dynamic copy for a task start/end or follow-up
     */
    getTaskNotificationCopy(task, type = 'start', tone = 'sweet') {
      const vars = {
        task: task.title || 'Focus Task',
        time: task.startMin !== undefined ? formatTimeHelper(task.startMin) : '',
      };

      if (type === 'start') {
        const template = pickRandom(NOTIFICATION_POOLS.tasks.start);
        return {
          title: `⚡ Starting Now: ${task.title}`,
          body: formatTemplate(template, vars),
        };
      }

      if (type === 'end') {
        const template = pickRandom(NOTIFICATION_POOLS.tasks.end);
        return {
          title: `🎯 Handoff: ${task.title}`,
          body: formatTemplate(template, vars),
        };
      }

      // Follow-up
      const followUpPool = NOTIFICATION_POOLS.tasks.followUp[tone] || NOTIFICATION_POOLS.tasks.followUp.sweet;
      const template = pickRandom(followUpPool);
      return {
        title: `👀 Follow-Up: ${task.title}`,
        body: formatTemplate(template, vars),
      };
    },

    /**
     * Synchronize all scheduled notifications for the current day based on app state
     */
    async syncAllAppNotifications(state) {
      if (!state) return;
      await this.initChannels();

      const plugin = getLocalNotificationsPlugin();
      if (!plugin) return;

      // Cancel outdated pending notifications
      await this.cancelAll();

      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth();
      const currentDay = now.getDate();

      const scheduledNotifications = [];
      let notifIdCounter = 1000;

      // 1. SCHEDULE COMPARTMENT TRANSITIONS (Dawn, Morning, Afternoon, Evening)
      if (Array.isArray(state.compartments)) {
        state.compartments.forEach((comp) => {
          const compStartMin = comp.startMin || 0;
          const compDate = new Date(currentYear, currentMonth, currentDay, Math.floor(compStartMin / 60), compStartMin % 60, 0);

          if (compDate > now) {
            const copy = this.getCompartmentTransitionCopy(comp.id, 0);
            scheduledNotifications.push({
              id: notifIdCounter++,
              title: copy.title,
              body: copy.body,
              schedule: { at: compDate },
              channelId: this.CHANNELS.ROUTINE,
            });
          }
        });
      }

      // 2. SCHEDULE TIMELINE TASK ALERTS (Start, End & 35-min Follow-up)
      const tasks = Array.isArray(state.tasks) ? state.tasks : [];
      tasks.forEach((task) => {
        if (task.done) return;

        // Check if task is scheduled for today
        const taskDay = task.day !== undefined && task.day !== null ? Number(task.day) : currentDay;
        if (taskDay !== currentDay && task.repeat === 'once') return;

        const startMin = task.startMin || 0;
        const durMin = task.durationMin || 30;

        // Task Start Alert
        if (task.alertStart) {
          const startDate = new Date(currentYear, currentMonth, currentDay, Math.floor(startMin / 60), startMin % 60, 0);
          if (startDate > now) {
            const copy = this.getTaskNotificationCopy(task, 'start');
            scheduledNotifications.push({
              id: notifIdCounter++,
              title: copy.title,
              body: copy.body,
              schedule: { at: startDate },
              channelId: this.CHANNELS.URGENT,
            });
          }
        }

        // Task End Alert
        if (task.alertEnd) {
          const endMin = startMin + durMin;
          const endDate = new Date(currentYear, currentMonth, currentDay, Math.floor(endMin / 60), endMin % 60, 0);
          if (endDate > now) {
            const copy = this.getTaskNotificationCopy(task, 'end');
            scheduledNotifications.push({
              id: notifIdCounter++,
              title: copy.title,
              body: copy.body,
              schedule: { at: endDate },
              channelId: this.CHANNELS.ROUTINE,
            });
          }
        }

        // Task Follow-Up Alert (35 mins after start time if uncompleted)
        const followUpMin = startMin + 35;
        const followUpDate = new Date(currentYear, currentMonth, currentDay, Math.floor(followUpMin / 60), followUpMin % 60, 0);
        if (followUpDate > now) {
          const randomTone = ['begging', 'passiveAggressive', 'sweet', 'comforting'][Math.floor(Math.random() * 4)];
          const copy = this.getTaskNotificationCopy(task, 'followUp', randomTone);
          scheduledNotifications.push({
            id: notifIdCounter++,
            title: copy.title,
            body: copy.body,
            schedule: { at: followUpDate },
            channelId: this.CHANNELS.URGENT,
          });
        }
      });

      // 3. SCHEDULE DAILY HABIT NOTIFICATIONS (Scheduled Time & Evening Streak Check)
      const habits = Array.isArray(state.habits) ? state.habits : [];
      habits.forEach((habit) => {
        if (habit.done) return;

        // Habit Scheduled Time
        const habitTimeMin = habit.timeMin || 480;
        const habitDate = new Date(currentYear, currentMonth, currentDay, Math.floor(habitTimeMin / 60), habitTimeMin % 60, 0);
        if (habitDate > now) {
          const copy = this.getHabitNotificationCopy(habit, 'sweet');
          scheduledNotifications.push({
            id: notifIdCounter++,
            title: copy.title,
            body: copy.body,
            schedule: { at: habitDate },
            channelId: this.CHANNELS.ROUTINE,
          });
        }

        // Evening Habit Check-In (19:45)
        const eveningDate = new Date(currentYear, currentMonth, currentDay, 19, 45, 0);
        if (eveningDate > now) {
          // Select either Begging, Passive-Aggressive, Sweet, or Comforting
          const tones = ['begging', 'passiveAggressive', 'comforting', 'sweet'];
          const eveningTone = tones[Math.floor(Math.random() * tones.length)];
          const copy = this.getHabitNotificationCopy(habit, eveningTone);
          scheduledNotifications.push({
            id: notifIdCounter++,
            title: copy.title,
            body: copy.body,
            schedule: { at: eveningDate },
            channelId: this.CHANNELS.URGENT,
          });
        }
      });

      // 4. SCHEDULE EVENING PROGRESS RING CHECK (20:45)
      const ringCheckDate = new Date(currentYear, currentMonth, currentDay, 20, 45, 0);
      if (ringCheckDate > now) {
        const ringTemplate = pickRandom(NOTIFICATION_POOLS.rings);
        scheduledNotifications.push({
          id: notifIdCounter++,
          title: '⭕ Daily Rings Check-in',
          body: formatTemplate(ringTemplate, { pct: 65 }),
          schedule: { at: ringCheckDate },
          channelId: this.CHANNELS.ROUTINE,
        });
      }

      // Schedule batch through Capacitor
      if (scheduledNotifications.length > 0) {
        try {
          await plugin.schedule({ notifications: scheduledNotifications });
          console.log(`[NotificationEngine] Successfully scheduled ${scheduledNotifications.length} notifications.`);
        } catch (err) {
          console.warn('[NotificationEngine] Batch schedule error:', err);
        }
      }
    },
  };

  function formatTimeHelper(totalMin) {
    const hh24 = Math.floor(totalMin / 60);
    const mm = totalMin % 60;
    const period = hh24 >= 12 ? 'PM' : 'AM';
    const hh12 = hh24 % 12 === 0 ? 12 : hh24 % 12;
    return `${String(hh12).padStart(2, '0')}:${String(mm).padStart(2, '0')} ${period}`;
  }

  // Expose to window for global app lifecycle integration
  window.StructuredNotificationEngine = StructuredNotificationEngine;
})();
