export interface LaneAssignable {
  id: string;
  start: string;
  end: string;
}

/**
 * 겹치는 날짜 구간들을 레인(줄) 인덱스에 배정한다 — 같은 레인 안에서는 서로 겹치지 않는다.
 * 당일 반납 후 당일 재출고를 허용하는 것과 동일하게, 한쪽의 종료일과 다른 쪽의 시작일이
 * 같은 날이면 겹치지 않는 것으로 본다. 미니 캘린더의 연속 막대(bar) 스택 렌더링에 쓴다 —
 * 날짜 전체에 걸쳐 한 번만 계산해야 같은 이벤트가 매일 같은 줄에 그려진다.
 */
export function assignLanes<T extends LaneAssignable>(items: T[]): Map<string, number> {
  const sorted = [...items].sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
  const laneEndDates: string[] = [];
  const laneById = new Map<string, number>();

  for (const item of sorted) {
    let lane = laneEndDates.findIndex((end) => end <= item.start);
    if (lane === -1) {
      lane = laneEndDates.length;
      laneEndDates.push(item.end);
    } else {
      laneEndDates[lane] = item.end;
    }
    laneById.set(item.id, lane);
  }

  return laneById;
}
