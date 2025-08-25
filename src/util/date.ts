// import dayjs from 'dayjs';
import * as dayjs from 'dayjs';
import * as relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/ko';

dayjs.extend(relativeTime);
dayjs.locale('ko');

//
export function parseRelativeKoreanTime(str: string): Date {
  const now = dayjs();

  if (str.includes('분 전')) {
    const minutes = parseInt(str.replace('분 전', '').trim(), 10);
    return now.subtract(minutes, 'minute').toDate();
  }

  if (str.includes('시간 전')) {
    const hours = parseInt(str.replace('시간 전', '').trim(), 10);
    return now.subtract(hours, 'hour').toDate();
  }

  if (str.includes('일 전')) {
    const days = parseInt(str.replace('일 전', '').trim(), 10);
    return now.subtract(days, 'day').toDate();
  }

  if (str.includes('개월 전')) {
    const months = parseInt(str.replace('개월 전', '').trim(), 10);
    return now.subtract(months, 'month').toDate();
  }

  if (str.includes('년 전')) {
    const years = parseInt(str.replace('년 전', '').trim(), 10);
    return now.subtract(years, 'year').toDate();
  }

  // "방금 전" 같은 특수 케이스
  if (str.includes('방금 전')) {
    return now.toDate();
  }
  if (dayjs(str).isValid()) {
    return dayjs(str).toDate();
  }

  // 혹시 모르는 경우는 그냥 현재 시간
  return now.toDate();
}
