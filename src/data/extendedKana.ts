import type { Kana, KanaKind } from '../types'

type VoicedRow = readonly [base: string, character: string, sound: string, mark: '゛' | '゜']
type YoonRow = readonly [base: string, small: string, character: string, sound: string]

const hiraganaVoiced: readonly VoicedRow[] = [
  ['か', 'が', 'ga', '゛'], ['き', 'ぎ', 'gi', '゛'], ['く', 'ぐ', 'gu', '゛'], ['け', 'げ', 'ge', '゛'], ['こ', 'ご', 'go', '゛'],
  ['さ', 'ざ', 'za', '゛'], ['し', 'じ', 'ji · 사행', '゛'], ['す', 'ず', 'zu · 사행', '゛'], ['せ', 'ぜ', 'ze', '゛'], ['そ', 'ぞ', 'zo', '゛'],
  ['た', 'だ', 'da', '゛'], ['ち', 'ぢ', 'ji · 타행', '゛'], ['つ', 'づ', 'zu · 타행', '゛'], ['て', 'で', 'de', '゛'], ['と', 'ど', 'do', '゛'],
  ['は', 'ば', 'ba', '゛'], ['ひ', 'び', 'bi', '゛'], ['ふ', 'ぶ', 'bu', '゛'], ['へ', 'べ', 'be', '゛'], ['ほ', 'ぼ', 'bo', '゛'],
  ['は', 'ぱ', 'pa', '゜'], ['ひ', 'ぴ', 'pi', '゜'], ['ふ', 'ぷ', 'pu', '゜'], ['へ', 'ぺ', 'pe', '゜'], ['ほ', 'ぽ', 'po', '゜'],
]

const katakanaVoiced: readonly VoicedRow[] = [
  ['カ', 'ガ', 'ga', '゛'], ['キ', 'ギ', 'gi', '゛'], ['ク', 'グ', 'gu', '゛'], ['ケ', 'ゲ', 'ge', '゛'], ['コ', 'ゴ', 'go', '゛'],
  ['サ', 'ザ', 'za', '゛'], ['シ', 'ジ', 'ji · 사행', '゛'], ['ス', 'ズ', 'zu · 사행', '゛'], ['セ', 'ゼ', 'ze', '゛'], ['ソ', 'ゾ', 'zo', '゛'],
  ['タ', 'ダ', 'da', '゛'], ['チ', 'ヂ', 'ji · 타행', '゛'], ['ツ', 'ヅ', 'zu · 타행', '゛'], ['テ', 'デ', 'de', '゛'], ['ト', 'ド', 'do', '゛'],
  ['ハ', 'バ', 'ba', '゛'], ['ヒ', 'ビ', 'bi', '゛'], ['フ', 'ブ', 'bu', '゛'], ['ヘ', 'ベ', 'be', '゛'], ['ホ', 'ボ', 'bo', '゛'],
  ['ハ', 'パ', 'pa', '゜'], ['ヒ', 'ピ', 'pi', '゜'], ['フ', 'プ', 'pu', '゜'], ['ヘ', 'ペ', 'pe', '゜'], ['ホ', 'ポ', 'po', '゜'],
]

const hiraganaYoon: readonly YoonRow[] = [
  ['き', 'ゃ', 'きゃ', 'kya'], ['き', 'ゅ', 'きゅ', 'kyu'], ['き', 'ょ', 'きょ', 'kyo'],
  ['し', 'ゃ', 'しゃ', 'sha'], ['し', 'ゅ', 'しゅ', 'shu'], ['し', 'ょ', 'しょ', 'sho'],
  ['ち', 'ゃ', 'ちゃ', 'cha'], ['ち', 'ゅ', 'ちゅ', 'chu'], ['ち', 'ょ', 'ちょ', 'cho'],
  ['に', 'ゃ', 'にゃ', 'nya'], ['に', 'ゅ', 'にゅ', 'nyu'], ['に', 'ょ', 'にょ', 'nyo'],
  ['ひ', 'ゃ', 'ひゃ', 'hya'], ['ひ', 'ゅ', 'ひゅ', 'hyu'], ['ひ', 'ょ', 'ひょ', 'hyo'],
  ['み', 'ゃ', 'みゃ', 'mya'], ['み', 'ゅ', 'みゅ', 'myu'], ['み', 'ょ', 'みょ', 'myo'],
  ['り', 'ゃ', 'りゃ', 'rya'], ['り', 'ゅ', 'りゅ', 'ryu'], ['り', 'ょ', 'りょ', 'ryo'],
  ['ぎ', 'ゃ', 'ぎゃ', 'gya'], ['ぎ', 'ゅ', 'ぎゅ', 'gyu'], ['ぎ', 'ょ', 'ぎょ', 'gyo'],
  ['じ', 'ゃ', 'じゃ', 'ja'], ['じ', 'ゅ', 'じゅ', 'ju'], ['じ', 'ょ', 'じょ', 'jo'],
  ['び', 'ゃ', 'びゃ', 'bya'], ['び', 'ゅ', 'びゅ', 'byu'], ['び', 'ょ', 'びょ', 'byo'],
  ['ぴ', 'ゃ', 'ぴゃ', 'pya'], ['ぴ', 'ゅ', 'ぴゅ', 'pyu'], ['ぴ', 'ょ', 'ぴょ', 'pyo'],
]

const katakanaYoon: readonly YoonRow[] = [
  ['キ', 'ャ', 'キャ', 'kya'], ['キ', 'ュ', 'キュ', 'kyu'], ['キ', 'ョ', 'キョ', 'kyo'],
  ['シ', 'ャ', 'シャ', 'sha'], ['シ', 'ュ', 'シュ', 'shu'], ['シ', 'ョ', 'ショ', 'sho'],
  ['チ', 'ャ', 'チャ', 'cha'], ['チ', 'ュ', 'チュ', 'chu'], ['チ', 'ョ', 'チョ', 'cho'],
  ['ニ', 'ャ', 'ニャ', 'nya'], ['ニ', 'ュ', 'ニュ', 'nyu'], ['ニ', 'ョ', 'ニョ', 'nyo'],
  ['ヒ', 'ャ', 'ヒャ', 'hya'], ['ヒ', 'ュ', 'ヒュ', 'hyu'], ['ヒ', 'ョ', 'ヒョ', 'hyo'],
  ['ミ', 'ャ', 'ミャ', 'mya'], ['ミ', 'ュ', 'ミュ', 'myu'], ['ミ', 'ョ', 'ミョ', 'myo'],
  ['リ', 'ャ', 'リャ', 'rya'], ['リ', 'ュ', 'リュ', 'ryu'], ['リ', 'ョ', 'リョ', 'ryo'],
  ['ギ', 'ャ', 'ギャ', 'gya'], ['ギ', 'ュ', 'ギュ', 'gyu'], ['ギ', 'ョ', 'ギョ', 'gyo'],
  ['ジ', 'ャ', 'ジャ', 'ja'], ['ジ', 'ュ', 'ジュ', 'ju'], ['ジ', 'ョ', 'ジョ', 'jo'],
  ['ビ', 'ャ', 'ビャ', 'bya'], ['ビ', 'ュ', 'ビュ', 'byu'], ['ビ', 'ョ', 'ビョ', 'byo'],
  ['ピ', 'ャ', 'ピャ', 'pya'], ['ピ', 'ュ', 'ピュ', 'pyu'], ['ピ', 'ョ', 'ピョ', 'pyo'],
]

function voicedKana(rows: readonly VoicedRow[], kind: KanaKind): Kana[] {
  return rows.map(([base, character, sound, mark]) => ({
    character,
    sound,
    kind,
    course: 'voiced',
    composition: `${base} + ${mark} → ${character}`,
    description: mark === '゜'
      ? `${base}에 반탁점을 붙여 p 계열 소리로 바꿔요.`
      : `${base}에 탁점을 붙여 울림이 있는 소리로 바꿔요.`,
  }))
}

function yoonKana(rows: readonly YoonRow[], kind: KanaKind): Kana[] {
  return rows.map(([base, small, character, sound]) => ({
    character,
    sound,
    kind,
    course: 'yoon',
    composition: `${base} + 작은 ${small} → ${character}`,
    description: `${base} 뒤에 작은 ${small}를 붙여 한 박자로 이어 읽어요.`,
  }))
}

export const EXTENDED_KANA: readonly Kana[] = [
  ...voicedKana(hiraganaVoiced, 'hiragana'),
  ...voicedKana(katakanaVoiced, 'katakana'),
  ...yoonKana(hiraganaYoon, 'hiragana'),
  ...yoonKana(katakanaYoon, 'katakana'),
]
