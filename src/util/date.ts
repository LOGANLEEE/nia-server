// import dayjs from 'dayjs';
import * as dayjs from 'dayjs';
import * as relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/ko';

dayjs.extend(relativeTime);
dayjs.locale('ko');

/**
 * 한국어 상대 시간 문자열을 Date 객체로 변환합니다.
 * @param str 변환할 상대 시간 문자열 (예: '3분 ', '2시간 ', '방금 ')
 * @returns 변환된 Date 객체
 * @throws {Error} 입력 문자열이 null이거나 undefined인 경우
 */
export function parseRelativeKoreanTime(str: string): Date {
  // 입력값 유효성 검사
  if (str === null || str === undefined) {
    throw new Error('입력 문자열이 null이거나 undefined입니다.');
  }

  if (typeof str !== 'string') {
    throw new Error(`문자열 타입이 아닌 ${typeof str} 타입이 입력되었습니다.`);
  }

  const now = dayjs();
  
  try {
    // 빈 문자열 처리
    if (str.trim() === '') {
      console.warn('빈 문자열이 입력되었습니다. 현재 시간을 반환합니다.');
      return now.toDate();
    }

    if (str.includes('분 ')) {
      const minutes = parseInt(str.replace('분 ', '').trim(), 10);
      if (isNaN(minutes)) {
        console.warn(`'분 ' 파싱 중 유효하지 않은 숫자: ${str}`);
        return now.toDate();
      }
      return now.subtract(minutes, 'minute').toDate();
    }

    if (str.includes('시간 ')) {
      const hours = parseInt(str.replace('시간 ', '').trim(), 10);
      if (isNaN(hours)) {
        console.warn(`'시간 ' 파싱 중 유효하지 않은 숫자: ${str}`);
        return now.toDate();
      }
      return now.subtract(hours, 'hour').toDate();
    }

    if (str.includes('일 ')) {
      const days = parseInt(str.replace('일 ', '').trim(), 10);
      if (isNaN(days)) {
        console.warn(`'일 ' 파싱 중 유효하지 않은 숫자: ${str}`);
        return now.toDate();
      }
      return now.subtract(days, 'day').toDate();
    }

    if (str.includes('개월 ')) {
      const months = parseInt(str.replace('개월 ', '').trim(), 10);
      if (isNaN(months)) {
        console.warn(`'개월 ' 파싱 중 유효하지 않은 숫자: ${str}`);
        return now.toDate();
      }
      return now.subtract(months, 'month').toDate();
    }

    if (str.includes('년 ')) {
      const years = parseInt(str.replace('년 ', '').trim(), 10);
      if (isNaN(years)) {
        console.warn(`'년 ' 파싱 중 유효하지 않은 숫자: ${str}`);
        return now.toDate();
      }
      return now.subtract(years, 'year').toDate();
    }

    // "방금 " 같은 특수 케이스
    if (str.includes('방금 ')) {
      return now.toDate();
    }

    // 일반 날짜 형식 시도
    if (dayjs(str).isValid()) {
      return dayjs(str).toDate();
    }

    // 인식할 수 없는 형식
    console.warn(`인식할 수 없는 날짜 형식: ${str}, 현재 시간을 반환합니다.`);
    return now.toDate();
  } catch (error) {
    console.error(`날짜 파싱 중 오류 발생: ${error.message}`, error);
    return now.toDate();
  }
}
