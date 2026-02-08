export const LEFT_EDGE_THRESHOLD_PX = 24;
export const OPEN_DRAWER_DELTA_X_PX = 56;

export const shouldCaptureReminderEdgeGesture = (args: {
    dbReady: boolean;
    drawerVisible: boolean;
    startX: number;
    dx: number;
    dy: number;
}): boolean => {
    if (!args.dbReady || args.drawerVisible) return false;
    if (args.startX > LEFT_EDGE_THRESHOLD_PX) return false;
    const horizontalDistance = Math.abs(args.dx);
    const verticalDistance = Math.abs(args.dy);
    return horizontalDistance > 12 && horizontalDistance > verticalDistance;
};

export const shouldOpenReminderDrawerFromSwipe = (args: {
    dbReady: boolean;
    drawerVisible: boolean;
    startedAtLeftEdge: boolean;
    dx: number;
    dy: number;
}): boolean => {
    if (!args.dbReady || args.drawerVisible) return false;
    if (!args.startedAtLeftEdge) return false;
    const isHorizontal = Math.abs(args.dx) > Math.abs(args.dy);
    return isHorizontal && args.dx > OPEN_DRAWER_DELTA_X_PX;
};

export const canOpenReminderDrawerFromButton = (dbReady: boolean): boolean => dbReady;
