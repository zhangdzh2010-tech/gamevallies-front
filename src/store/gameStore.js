import { create } from 'zustand';
import * as gameService from '../services/game';

// Pipeline stages matching backend ai-engine stages
const PIPELINE_STAGES = [
  { key: 'submitting',        label: '提交创作请求',    pct: 5 },
  { key: 'intent_parsing',    label: '解析游戏意图',    pct: 15 },
  { key: 'designing',         label: '设计游戏参数',    pct: 25 },
  { key: 'template_matching', label: '匹配游戏模板',    pct: 35 },
  { key: 'code_generating',   label: '生成游戏代码',    pct: 55 },
  { key: 'qa_checking',       label: '质量检测中',      pct: 75 },
  { key: 'runtime_qa',        label: '运行时验证',      pct: 85 },
  { key: 'code_review',       label: 'AI 代码审核',     pct: 92 },
  { key: 'completed',         label: '生成完成！',      pct: 100 },
];

export const useGameStore = create((set, get) => ({
  currentGame: null,
  myGames: [],
  isGenerating: false,
  // { stageIndex, stageKey, stageLabel, pct }
  generationProgress: null,
  generatingGameId: null,
  isLoading: false,
  error: null,

  /**
   * Create new game from description — uses polling instead of WebSocket
   */
  createGame: async (description) => {
    set({
      isLoading: true,
      isGenerating: true,
      error: null,
      generationProgress: { stageIndex: 0, stageKey: 'submitting', stageLabel: '提交创作请求', pct: 5 },
    });

    try {
      const gameId = await gameService.generateGame(description);
      set({ generatingGameId: gameId, isLoading: false });

      // Start simulated progress + polling
      get()._startProgressPolling(gameId);

      return gameId;
    } catch (error) {
      const msg = (error && error.message) ? error.message : '游戏创建失败，请稍后重试';
      set({
        isLoading: false,
        isGenerating: false,
        generationProgress: null,
        error: msg,
      });
      throw new Error(msg);
    }
  },

  /**
   * Internal: simulate pipeline stage progress while polling backend for actual status
   */
  _startProgressPolling: (gameId) => {
    let stageIdx = 1; // start from intent_parsing (stage 1)
    const totalSimStages = PIPELINE_STAGES.length - 1; // exclude 'completed'

    // Simulate stage progression — advance one stage every ~8s
    const simInterval = setInterval(() => {
      if (stageIdx < totalSimStages) {
        const stage = PIPELINE_STAGES[stageIdx];
        set({
          generationProgress: {
            stageIndex: stageIdx,
            stageKey: stage.key,
            stageLabel: stage.label,
            pct: stage.pct,
          },
        });
        stageIdx++;
      }
    }, 8000);

    // Poll backend for actual completion every 5s
    const pollInterval = setInterval(async () => {
      try {
        const game = await gameService.getGame(gameId);
        const status = game?.status;

        if (status === 'ready' || status === 'draft' || status === 'published') {
          // Done!
          clearInterval(simInterval);
          clearInterval(pollInterval);
          const doneStage = PIPELINE_STAGES[PIPELINE_STAGES.length - 1];
          set({
            generationProgress: {
              stageIndex: PIPELINE_STAGES.length - 1,
              stageKey: doneStage.key,
              stageLabel: doneStage.label,
              pct: 100,
            },
            currentGame: game,
          });
          // Keep showing 100% for 1.5s then reset
          setTimeout(() => {
            set({ isGenerating: false, generationProgress: null, generatingGameId: null });
          }, 1500);
        } else if (status === 'failed') {
          clearInterval(simInterval);
          clearInterval(pollInterval);
          set({
            isGenerating: false,
            generationProgress: null,
            generatingGameId: null,
            error: '游戏生成失败，请重试',
          });
        }
        // else still 'generating' — keep polling
      } catch (e) {
        // Network error — keep polling
      }
    }, 5000);

    // Safety timeout after 3 minutes
    setTimeout(() => {
      clearInterval(simInterval);
      clearInterval(pollInterval);
      const { isGenerating } = get();
      if (isGenerating) {
        set({
          isGenerating: false,
          generationProgress: null,
          generatingGameId: null,
          error: '生成超时，请稍后查看"我的游戏"',
        });
      }
    }, 180000);
  },

  /**
   * Iterate on existing game
   */
  iterateGame: async (gameId, feedback) => {
    set({ isLoading: true, isGenerating: true, error: null });
    try {
      await gameService.iterateGame(gameId, feedback);
      set({ isLoading: false });
      get()._startProgressPolling(gameId);
    } catch (error) {
      set({
        isLoading: false,
        isGenerating: false,
        error: (error && error.message) || '迭代失败，请重试',
      });
      throw error;
    }
  },

  forkGame: async (gameId) => {
    set({ isLoading: true, error: null });
    try {
      const newGameId = await gameService.forkGame(gameId);
      const game = await gameService.getGame(newGameId);
      set({ currentGame: game, isLoading: false });
      return newGameId;
    } catch (error) {
      set({ isLoading: false, error: (error && error.message) || '复制失败' });
      throw error;
    }
  },

  publishGame: async (gameId, data) => {
    set({ isLoading: true, error: null });
    try {
      const publishedGame = await gameService.publishGame(gameId, data);
      set({ currentGame: publishedGame, isLoading: false });
    } catch (error) {
      set({ isLoading: false, error: (error && error.message) || '发布失败' });
      throw error;
    }
  },

  fetchMyGames: async (page = 1, limit = 10) => {
    set({ isLoading: true, error: null });
    try {
      const result = await gameService.getMyGames(page, limit);
      set({
        myGames: page === 1 ? result.items : [...get().myGames, ...result.items],
        isLoading: false,
      });
    } catch (error) {
      set({ isLoading: false, error: (error && error.message) || '加载失败' });
      throw error;
    }
  },

  setCurrentGame: (game) => set({ currentGame: game }),
  clearError: () => set({ error: null }),
}));

export { PIPELINE_STAGES };
export default useGameStore;
