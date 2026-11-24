// Kelk 3.4's OCR lab: scanned pages of our own Persian text, each page one picture and no text layer, as a scanner
// writes them — the text set by Chromium in faces Kelk ships, then degraded in the page's canvas (a slight skew, blur,
// noise, binarised by Otsu's threshold) and written as one image a page:
//   · scan-300--scan-plain-fa      two pages, B Nazanin, 300 dpi, 1-bit (Flate)
//   · scan-300--scan-framed-fa     one page, B Mitra, the text block in a printed frame of rules, 300 dpi, 1-bit
//   · scan-150--scan-low-fa        one page, Vazirmatn, 150 dpi grey JPEG (quality 0.35), not binarised
//   · scan-300--scan-headings-fa   one page, B Titr headings over B Nazanin paragraphs, 300 dpi, 1-bit
//   · scan-300--scan-columns-fa    one page in two columns, B Nazanin, 300 dpi, 1-bit (3.4: OCR reads it as one column —
//                                  the report notes it, ocrColumns; the answer key is the right order, column by column)
// Kelk 3.6's scans, for OCR lines laid out as any page's (written for 3.6, 2026-11-22; measured with 3.5's importer first):
//   · scan-300--scan-list-fa       one page: a numbered list (one item wrapped), bullets set in under an item
//   · scan-300--scan-table-fa      one page: a ruled table under its «جدول ۱- …» title
//   · scan-300--scan-index-fa      one page: a two-column index without borders, as a book's index
//   · scan-300--scan-heads-fa      three pages under a running head (title, page number, a rule), paragraphs running on
//                                  from one page to the next
//   · scan-300--scan-picture-fa    one page: a line drawing between two paragraphs, its caption under it
//   · scan-300--scan-columns2-fa   one page: a running head, a full-width title over two columns
//   · scan-300--scan-pageframe-fa      two pages in a page frame, a running head over a thick rule on each: a lone rule, or a
//                                  frame, is no table — no `---` between paragraphs, the running heads still dropped
//   · scan-300--scan-dust-fa       dot-sized dust just before some lines' starts and past some lines' ends, beside a real
//                                  bullet list and real periods at lines' ends: dust goes, the bullets and periods stay
//   · scan-300--scan-cover-fa      a cover in a frame, a hatched picture at its top touching the frame, its title and credits
//                                  below: the picture grows along the frame's rules over the text — the text wins
//   · scan-300--scan-labels-fa     a drawing with two short labels inside it: one picture, its labels its description (and
//                                  OCR's letters are no word-end forms: no ZWNJ between them)
//   · scan-300--scan-sideways-fa   a table printed sideways under an upright title: its text mostly one-letter words, the
//                                  page keeps its picture
//   · scan-300--scan-specks-fa     one page of paragraphs, dust in its margins beside a few lines (a dot, a comma): a speck
//                                  Tesseract reads at a line's end, far from its words, is no column of its own
// node scripts/make-scans.js [name …] makes only the files named (each scan's pixels follow Chromium's drawing, so
// regenerating one file leaves the others as they are).
// A book page of 5.5 × 8.5 in (396 × 612 pt), as an older scanned book. IMITATED: a real scan is often JBIG2 or
// CCITT, which we cannot write here; pdf.js decodes every one of them, so the page's pixels are what OCR reads.
// The text is ours, written for these files (2026-11-21 and 2026-11-22), so it is in no corpus the language model counted
// (tools/lm/lm.json: Kelk's text up to 2026-11-21 and the Leipzig corpora); it also stays out of letterstats.js
// (MEASURED in tools/build-letterstats.js). Lab files carry no personal metadata: Producer, Creator and Title only.
//   node scripts/make-scans.js   → pdf/rtl/scan-*.pdf and corpus/scan-*-fa.md
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib'), os = require('os');
const env = require('./env.js');
const { chromium } = env.req('playwright');
const root = path.join(__dirname, '..', '..', '..');
const JSZip = require(path.join(root, 'vendor', fs.readdirSync(path.join(root, 'vendor')).find((f) => /^jszip\.min_.*\.js$/.test(f))));

const W_PT = 396, H_PT = 612;
const PRODUCER = 'Kelk lab scanner';

// ---- the text (ours) ---------------------------------------------------------------------------------------------------
const PLAIN = [
  ['بازار کهنهٔ شهر در کنار رود ساخته شده است و هنوز بیشتر دکان‌های آن چوبی‌اند. صبح‌ها نخست نانواها در را باز می‌کنند و بوی نان تازه تا سر کوچه‌ها می‌رود. پس از آنان مسگرها کار را آغاز می‌کنند و صدای چکش‌هایشان تا ظهر شنیده می‌شود. کسانی که از روستاهای دور می‌آیند، میوه و پنیر و عسل می‌آورند و در میدان کوچک کنار پل می‌فروشند.',
   'در گوشهٔ شمالی بازار کاروانسرای بزرگی هست که روزگاری بازرگانان در آن بار می‌انداختند. امروز در حجره‌های آن فرش‌بافان و خیاطان کار می‌کنند و حیاط آن در تابستان جای نشستن پیرمردهای محله است. شهرداری چند سال پیش سقف کاروانسرا را تعمیر کرد و آب‌انبار کهنهٔ زیر آن را برای بازدید گردشگران باز گذاشت.'],
  ['بسیاری از خانواده‌های شهر نسل به نسل در این بازار کار کرده‌اند. پدربزرگ‌ها هنوز داستان روزهایی را می‌گویند که کالا با قاطر از کوه می‌آمد و راه سه روز طول می‌کشید. اکنون جادهٔ تازه‌ای شهر را به مرکز استان می‌پیوندد، اما بازار همچنان دل شهر است و مردم برای خرید و دیدار دوستان به آنجا می‌روند.',
   'شورای شهر برنامه‌ای نوشته است تا دکان‌های کهنه بی‌آنکه شکل خود را از دست بدهند بازسازی شوند. در این برنامه از استادکاران محلی خواسته شده است که در کار تعمیر شرکت کنند و شیوهٔ کار خود را به جوانان بیاموزند. نخستین بخش این کار در بهار آغاز می‌شود و تا پایان پاییز ادامه دارد.']
];
const FRAMED = ['باغ گیاه‌شناسی دانشگاه در دامنهٔ تپه‌ای آرام قرار دارد و بیش از هزار گونه گیاه در آن نگهداری می‌شود. بخش بزرگی از باغ به گیاهان کوهستانی سپرده شده است که دانشجویان در سفرهای پژوهشی خود از نقاط گوناگون کشور گرد آورده‌اند. در گلخانهٔ کنار در ورودی، گیاهان گرمسیری در هوای گرم و مرطوب رشد می‌کنند.',
  'باغبانان هر روز صبح پیش از آمدن بازدیدکنندگان به گیاهان آب می‌دهند و برگ‌های خشک را جمع می‌کنند. روی هر درخت تابلوی کوچکی نصب شده است که نام آن را به فارسی و به زبان علمی نشان می‌دهد. کتابخانهٔ باغ نیز مجموعه‌ای از نقاشی‌های قدیمی گیاهان دارد که پژوهشگران برای شناختن گونه‌ها از آن بهره می‌برند.'];
const LOW = ['کارگاه نجاری محله در زیرزمین ساختمان فرهنگسرا برپا شده است و هر هفته سه روز باز است. هنرجویان در آنجا ساختن میز و صندلی و جعبه‌های کوچک را یاد می‌گیرند و با ابزارهای دستی و برقی آشنا می‌شوند. مربی کارگاه سال‌ها در کارخانهٔ مبل‌سازی کار کرده است و به هنرجویان می‌آموزد که چگونه چوب را بشناسند و با آن رفتار کنند.',
  'در پایان هر دوره، کارهای هنرجویان در تالار فرهنگسرا به نمایش گذاشته می‌شود و خانواده‌ها برای دیدن آن‌ها می‌آیند. برخی از هنرجویان پس از گذراندن دوره، در خانه کارگاه کوچکی برای خود ساخته‌اند و سفارش همسایه‌ها را می‌پذیرند.'];
const HEADINGS = [['کشاورزی در دشت', 'دشت پهناوری که در جنوب شهر گسترده است، از دیرباز زمین کشاورزی مردم بوده است. گندم و جو در پاییز کاشته می‌شوند و در آغاز تابستان درو می‌شوند. کشاورزان آب را از چاه‌ها و قنات‌های کهن به زمین‌ها می‌رسانند و نوبت آبیاری هر زمین را با هم تعیین می‌کنند.'],
  ['آب و قنات', 'قنات‌های این دشت صدها سال پیش کنده شده‌اند و هنوز برخی از آن‌ها آب می‌دهند. نگهداری قنات کاری دشوار است و تنها چند خانواده هنر لایروبی آن را می‌دانند. در سال‌های اخیر گروهی از جوانان روستا این کار را از آنان آموخته‌اند.'],
  ['بازار محصول', 'پس از برداشت، بیشتر محصول به بازار شهر برده می‌شود و بخشی از آن در انبارهای روستا برای زمستان نگه داشته می‌شود.']];

const COLUMNS = ['ایستگاه قطار شهر در سال‌های نخست قرن ساخته شد و ساختمان سنگی آن هنوز بر جای مانده است. سالن انتظار سقفی بلند و پنجره‌هایی رنگی دارد که نور صبح را روی نیمکت‌های چوبی می‌اندازد. مسافران پیش از سوار شدن در قهوه‌خانهٔ کوچک کنار سکو چای می‌نوشند.',
  'هر روز دو قطار مسافری از این ایستگاه می‌گذرد، یکی به سوی پایتخت و دیگری به سوی بندر. قطار باری شب‌ها می‌آید و بار غله و میوه را به انبارهای جنوب می‌برد. کارکنان ایستگاه بیشترشان از مردم همین شهرند و برخی از آنان سی سال است که در اینجا کار می‌کنند.',
  'سال گذشته موزهٔ کوچکی در یکی از اتاق‌های ایستگاه گشایش یافت. در این موزه بلیت‌های قدیمی، فانوس‌های سوزنبانان و عکس‌هایی از نخستین قطارها نگهداری می‌شود. دانش‌آموزان مدرسه‌های شهر هر ماه برای دیدن آن می‌آیند و راهنمای موزه داستان ساختن راه‌آهن را برایشان می‌گوید.',
  'شهرداری می‌خواهد میدان جلوی ایستگاه را به باغی کوچک بدل کند. در طرح تازه درختان چنار کاشته می‌شوند و راهی سنگفرش از خیابان تا در ورودی کشیده می‌شود تا مسافران بی‌آنکه از میان خودروها بگذرند به ایستگاه برسند.'];

// 3.6's text (ours, 2026-11-22). Digits are drawn Persian and written ASCII in the answer key (Kelk's default).
const LIST = {
  title: 'راهنمای امانت کتاب',
  intro: 'کتابخانهٔ محله برای امانت گرفتن کتاب چند قاعدهٔ ساده دارد. این قاعده‌ها را شورای کتابخانه نوشته است تا همهٔ اعضا بتوانند به یک اندازه از کتاب‌ها بهره ببرند.',
  items: [['هر عضو می‌تواند در هر نوبت تا سه کتاب به امانت بگیرد.'],
    ['زمان امانت دو هفته است و می‌توان آن را یک بار دیگر تمدید کرد:', ['تمدید از راه تلفن کتابخانه', 'تمدید با آمدن به میز امانت']],
    ['کتاب‌های مرجع، مانند فرهنگ‌ها و دانشنامه‌ها، تنها در سالن مطالعه خوانده می‌شوند و نمی‌توان آن‌ها را به خانه برد، حتی برای یک شب.'],
    ['اگر کتابی گم شود، عضو باید نسخهٔ تازه‌ای از همان کتاب را بخرد و به کتابخانه بدهد.']],
  outro: 'پرسش‌های دیگر را می‌توان از کتابدار میز امانت پرسید.'
};
const TABLE = {
  title: 'ساعت کار بخش‌های کتابخانه',
  intro: 'بخش‌های کتابخانه در روزهای هفته ساعت‌های کار گوناگونی دارند. جدول زیر ساعت باز بودن هر بخش را نشان می‌دهد.',
  caption: 'جدول 1- ساعت کار بخش‌ها',
  rows: [['بخش', 'شنبه تا چهارشنبه', 'پنجشنبه', 'جمعه'],
    ['سالن مطالعه', '8 تا 20', '8 تا 14', 'بسته'],
    ['میز امانت', '9 تا 17', '9 تا 12', 'بسته'],
    ['بخش کودکان', '10 تا 18', '10 تا 13', '10 تا 12'],
    ['بخش نشریات', '8 تا 16', 'بسته', 'بسته']],
  outro: 'در روزهای تعطیل رسمی همهٔ بخش‌ها بسته‌اند و برنامهٔ روزهای ویژه از پیش روی تابلوی در ورودی نوشته می‌شود.'
};
const INDEX = {
  title: 'نمایهٔ موضوعی',
  rows: [['موضوع', 'صفحه'], ['آب‌انبار', '12، 45'], ['بازار', '3، 7، 19'], ['پل سنگی', '28'], ['چاپخانه', '33، 34'],
    ['حمام عمومی', '21'], ['راه‌آهن', '40، 41، 52'], ['فرهنگسرا', '15'], ['قنات', '9، 10، 47'], ['کاروانسرا', '5، 6'], ['موزه', '42']]
};
const HEADS = {
  head: 'تاریخچهٔ شهر', first: 24, title: 'راه‌ها و سفرها',
  paras: ['پیش از آنکه جادهٔ تازه ساخته شود، شهر تنها از راه‌های کوهستانی به جهان بیرون می‌پیوست. کاروان‌ها از گردنهٔ شمالی می‌گذشتند و در زمستان، هنگامی که برف راه را می‌بست، گاه هفته‌ها در کاروانسراهای میان راه می‌ماندند. بازرگانان پیر هنوز نام این کاروانسراها را به یاد دارند و از شب‌هایی می‌گویند که در کنار آتش داستان سفرهای دور را برای هم بازگو می‌کردند.',
    'نخستین جادهٔ خاکی در زمان پدربزرگ‌های امروزی کشیده شد. کارگران آن از روستاهای پیرامون آمده بودند و بیشتر کار را با بیل و کلنگ انجام می‌دادند. ساختن این جاده چهار سال طول کشید و در این مدت دو پل سنگی بر روی رود بزرگ برپا شد که یکی از آن‌ها هنوز بر جای مانده است و مردم برای دیدن غروب آفتاب به آنجا می‌روند.',
    'با آمدن نخستین کامیون‌ها کار کاروان‌ها کم‌کم به پایان رسید. قاطرداران یا به کشاورزی روی آوردند یا در گاراژهای تازه‌ای که در ورودی شهر ساخته شده بود به کار پرداختند. برخی از آنان رانندگی آموختند و سال‌ها بار بازار را با کامیون به شهرهای دیگر بردند. پسران آنان امروز شرکت‌های باربری کوچکی دارند که هنوز نام پدران را بر خود دارد.',
    'در دههٔ بعد راه‌آهن به شهر رسید و ایستگاه سنگی آن در دشت جنوبی ساخته شد. مردم شهر روز گشایش ایستگاه را جشن گرفتند و بسیاری از آنان برای نخستین بار سوار قطار شدند. از آن پس سفر به پایتخت که پیش‌تر دو هفته طول می‌کشید، در یک روز و یک شب انجام می‌شد و نامه‌ها نیز زودتر از همیشه به دست خانواده‌ها می‌رسید.',
    'امروز جادهٔ آسفالته، راه‌آهن و فرودگاه کوچک شمال شهر آن را به همه جای کشور می‌پیوندند. با این همه، راه کهنهٔ کاروان‌ها هنوز گذرگاه کوهنوردانی است که در بهار و تابستان از گردنه بالا می‌روند و در کاروانسرای نیمه‌ویران میان راه شب را به صبح می‌رسانند. گروهی از جوانان شهر هر سال در پاییز این راه را پاکسازی می‌کنند و نشانه‌های آن را از نو رنگ می‌زنند.',
    'شورای شهر می‌خواهد کاروانسرای میان راه را بازسازی کند تا کوهنوردان و گردشگران جای امنی برای ماندن داشته باشند. در این طرح اتاق‌های کاروانسرا به همان شکل کهن ساخته می‌شوند و تنها یک آشپزخانهٔ کوچک و چشمه‌ای برای آب آشامیدنی به آن افزوده می‌شود. کار ساختن از بهار آینده آغاز می‌شود.',
    'در کنار این طرح، موزهٔ ایستگاه نیز گسترش می‌یابد. اتاقی تازه برای نشان دادن ابزارهای قاطرداران و زین‌ها و فانوس‌های کاروان‌ها آماده می‌شود و پیرمردهای شهر قرار است داستان سفرهای خود را برای ضبط در آرشیو موزه بازگو کنند. دانش‌آموزان مدرسه‌های شهر نیز در گردآوری عکس‌های قدیمی خانواده‌ها به موزه یاری می‌دهند.',
    'کسانی که این راه‌ها را دیده‌اند می‌گویند که شهر بی آن‌ها هرگز به آنچه امروز هست نمی‌رسید. راه‌ها کالا و مسافر می‌آوردند، اما بیش از آن خبر و اندیشه و آشنایی با مردم سرزمین‌های دیگر را به شهر می‌رساندند. از همین رو شورای شهر نام راه کهنه را بر خیابان تازه‌ای نهاده است که از بازار به ایستگاه می‌رود.',
    'نقشهٔ همهٔ این راه‌ها، از راه کاروان‌ها تا راه‌آهن، در تالار فرهنگسرا بر دیوار آویخته شده است. بازدیدکنندگان می‌توانند بر روی آن ببینند که هر راه در چه سالی ساخته شد و از کدام روستاها می‌گذشت. کتابچهٔ کوچکی نیز در کنار نقشه هست که داستان هر راه را به زبانی ساده بازگو می‌کند.']
};
const PICTURE = {
  title: 'باغ ملی',
  before: 'در میانهٔ شهر باغی هست که مردم آن را باغ ملی می‌نامند. این باغ را صد سال پیش یکی از حاکمان شهر ساخت و پس از او به شهرداری سپرده شد. نقشهٔ ساده‌ای از بخش‌های باغ در شکل زیر آمده است.',
  caption: 'شکل 1- نقشهٔ ساده‌ای از باغ ملی',
  after: 'آبنمای بزرگ در میانهٔ باغ است و چهار راه سنگفرش از آن به چهار در باغ می‌رسد. درختان چنار کهن در دو سوی راه‌ها کاشته شده‌اند و در تابستان سایهٔ خنکی برای رهگذران می‌سازند.'
};
const COLUMNS2 = {
  head: 'راهنمای شهر', page: 8, title: 'گردشگری در شهر',
  paras: ['گردشگران بیشتر در بهار و پاییز به شهر می‌آیند، هنگامی که هوا نه سرد است و نه گرم. بیشتر آنان نخست به بازار کهنه سر می‌زنند و سپس از کاروانسرا و آب‌انبار زیر آن دیدن می‌کنند.',
    'در کنار میدان بزرگ دفتر کوچکی برای راهنمایی گردشگران باز شده است. کارکنان این دفتر نقشهٔ شهر را به رایگان می‌دهند و برای کسانی که بخواهند راهنمایی همراه می‌کنند که زبان‌های دیگر را نیز می‌داند.',
    'مهمان‌خانه‌های شهر بیشترشان خانه‌های قدیمی‌اند که خانواده‌ها آن‌ها را برای پذیرایی از مسافران آماده کرده‌اند. صبحانه در حیاط خانه داده می‌شود و میزبانان از داستان خانه و محله برای مهمانان می‌گویند.',
    'برای رفتن به کوه و دیدن راه کاروان‌ها بهتر است گردشگران صبح زود به راه بیفتند و آب و خوراک کافی همراه داشته باشند. در نیمهٔ راه چشمه‌ای هست که آب آن در همهٔ سال روان است.']
};
const SPECKS = {
  title: 'کارگاه سفال',
  paras: ['در کوچهٔ پشت بازار کارگاه کوچکی هست که سه نسل از یک خانواده در آن سفال ساخته‌اند. پدربزرگ کار را از پدر خود آموخت و امروز نوه‌هایش چرخ سفالگری را می‌گردانند و کوزه و کاسه و بشقاب می‌سازند.',
    'خاک کارگاه را از تپه‌های شمال شهر می‌آورند و چند روز در حوضچه‌ای پر از آب می‌خوابانند تا نرم شود. سپس آن را ورز می‌دهند و بر چرخ می‌گذارند. هر ظرف پس از ساخته شدن یک هفته در سایه خشک می‌شود و آنگاه به کوره می‌رود.',
    'نقش‌های سفال‌ها بیشتر گل و برگ و پرنده است و رنگ آبی فیروزه‌ای در آن‌ها بیش از رنگ‌های دیگر دیده می‌شود. گردشگران بسیاری برای خریدن این ظرف‌ها به کارگاه می‌آیند و گاه ساعتی می‌نشینند و کار سفالگران را تماشا می‌کنند.']
};
// (dust: a dot or a comma in a margin, beside a line, in points from the page's top-left — the left margin's text edge at
// 50 pt, the right's at 346 pt; the body's lines 21 pt apart from about 95 pt down)
const DUST = [['.', 22, 102], ['،', 368, 146], ['.', 26, 186], ['.', 364, 228], ['،', 20, 267]];
const FRAME = {
  head: 'گزارش سالانه', first: 12,
  paras: [['بخش نخست گزارش به کارهای انجام شده در سال گذشته می‌پردازد. در این سال کتابخانهٔ تازه‌ای در محلهٔ شرقی گشوده شد و شمار اعضای کتابخانه‌ها به بیش از دو برابر رسید.',
    'برنامهٔ کتابخوانی کودکان در تابستان برگزار شد و صدها کودک در آن شرکت کردند. هر هفته یکی از نویسندگان شهر برای کودکان داستان خواند و دربارهٔ کار نوشتن با آنان سخن گفت.'],
  ['بخش دوم گزارش برنامه‌های سال آینده را بازگو می‌کند. شورای کتابخانه‌ها می‌خواهد یک کتابخانهٔ سیار راه بیندازد تا کتاب به روستاهای پیرامون شهر نیز برسد.',
    'همچنین قرار است تالار مطالعهٔ کتابخانهٔ مرکزی بازسازی شود و ساعت کار آن تا پاسی از شب افزایش یابد. هزینهٔ این کارها از بودجهٔ شهرداری و کمک مردم فراهم می‌شود.']]
};
const DUSTP = {
  title: 'نکته‌های نگهداری کتاب',
  p1: 'کتاب‌ها اگر درست نگهداری شوند سال‌ها می‌مانند. کاغذ کهنه به نور و رطوبت حساس است و جلد کتاب با گذشت زمان سست می‌شود. چند نکتهٔ ساده به نگهداری بهتر کتاب‌ها کمک می‌کند.',
  items: ['کتاب را دور از نور مستقیم آفتاب بگذارید.', 'قفسه را در جای خشک و خنک بگذارید.', 'کتاب را از گوشهٔ جلد بیرون نکشید.'],
  p2: 'اگر کتابی آسیب دیده است، آن را به میز امانت بسپارید تا کارشناسان کتابخانه آن را مرمت کنند. هزینهٔ مرمت را کتابخانه می‌پردازد و کتاب پس از چند هفته به قفسه بازمی‌گردد.'
};
// (dust: dots a point and a half wide, in points from the page's top-left — the text runs from 50 to 346 pt; beside the
// right edge, just before a line's start; past the left edge, far from a line's end)
const DOTS = [[352, 110], [352, 223], [352, 265], [20, 86], [22, 178], [20, 245]];
const COVER = {
  title: 'تاریخچهٔ شهر',
  sub: 'از کاروان‌ها تا راه‌آهن',
  credit: 'گروه نویسندگان مدرسهٔ شهر',
  more: ['با یاری آموزگاران و پیران محله‌ها', 'چاپ نخست، کتابخانهٔ شهر', 'عکس‌ها از آلبوم‌های خانوادگی مردم شهر']
};
const LABELS = { title: 'نقشهٔ باغ', before: 'نقشهٔ ساده‌ای از باغ و دو بخش آن در زیر آمده است.', after: 'در باغ از بامداد تا شامگاه باز است.', labels: ['حوض', 'درختان'] };
const SIDEWAYS = {
  title: 'شمار کتاب‌ها و اعضا در سال‌های گذشته',
  rows: [['سال', 'کتاب', 'نشریه', 'عضو', 'امانت', 'تالار', 'هزینه']].concat([1390, 1391, 1392, 1393, 1394, 1395, 1396, 1397, 1398, 1399, 1400, 1401, 1402].map((y, k) =>
    [String(y), String(9100 + 610 * k), String(240 + 9 * k), String(1300 + 150 * k), String(22000 + 1350 * k), String(4 + (k % 3)), String(310 + 27 * k) + '/' + (k % 10)]))
};
const fa = (t) => t.replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
// a garden's plan, drawn in black lines only (no text in it): a wall, four paths to a round pool, trees as hatched discs
const GARDEN = (() => {
  const t = [];
  for (const [x, y] of [[50, 30], [90, 30], [150, 30], [190, 30], [50, 110], [90, 110], [150, 110], [190, 110]]) {
    t.push(`<circle cx="${x}" cy="${y}" r="11" fill="url(#h)" stroke="#000" stroke-width="1.6"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="240pt" height="140pt" viewBox="0 0 240 140">
    <defs><pattern id="h" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5" stroke="#000" stroke-width="1.6"/></pattern></defs>
    <rect x="6" y="6" width="228" height="128" fill="none" stroke="#000" stroke-width="3"/>
    <path d="M120 6 V48 M120 92 V134 M6 70 H98 M142 70 H234" stroke="#000" stroke-width="7" fill="none"/>
    <circle cx="120" cy="70" r="22" fill="none" stroke="#000" stroke-width="3"/><circle cx="120" cy="70" r="12" fill="#000"/>
    ${t.join('')}</svg>`;
})();

// ---- a page's HTML ------------------------------------------------------------------------------------------------------
function html(fonts, body, opts) {
  const ff = Object.entries(fonts).map(([n, f]) => `@font-face{font-family:${n};src:url(${env.fileUrl(f)})}`).join('');
  const frame = opts.frame ? 'border:3px double #000;padding:18px 20px;' : '';
  return `<!doctype html><html dir="rtl" lang="fa"><head><meta charset="utf-8"><style>${ff}
    html,body{margin:0;background:#fff}
    .page{box-sizing:border-box;width:${W_PT}pt;height:${H_PT}pt;padding:54pt 50pt 60pt 50pt}
    .block{${frame}height:100%;box-sizing:border-box${opts.cols ? ';column-count:' + opts.cols + ';column-gap:26pt' : ''}}
    p{font-family:${opts.body};font-size:${opts.size || 12}pt;line-height:1.75;text-align:justify;margin:0 0 9pt 0;color:#000}
    h1{font-family:${opts.head || opts.body};font-size:15pt;font-weight:normal;margin:6pt 0 6pt 0;color:#000}${opts.rh ? EXTRA(opts) : ''}
    </style></head><body><div class="page">${opts.rh && opts.rh.length ? `<div class="rh"><span>${opts.rh[0]}</span><span>${opts.rh[1]}</span></div>` : ''}<div class="block">${body}</div></div></body></html>`;
}
// 3.6's pages (opts.rh: a running head [title, page number], or [] for none): lists, tables, a figure, a page's flow
function EXTRA(opts) {
  const rh = opts.rh.length ? 30 : 0;
  return `
    .rh{display:flex;justify-content:space-between;font-family:${opts.body};font-size:10pt;line-height:1.4;border-bottom:1px solid #000;padding-bottom:3pt;margin-bottom:${rh - 18}pt;color:#000}
    .page>.block{height:calc(100% - ${rh}pt)}
    ol,ul{margin:0 0 9pt 0;padding-right:22pt;font-family:${opts.body};font-size:${opts.size || 12}pt;line-height:1.75}
    ol{list-style-type:persian} ul{list-style-type:disc;margin:0}
    li{text-align:justify}
    table{border-collapse:collapse;width:100%;margin:0 0 12pt 0}
    td{font-family:${opts.body};font-size:11pt;line-height:1.5;color:#000;text-align:center;padding:3pt 5pt}
    table.ruled td{border:1.2px solid #000}
    table.idx{width:70%;margin:0 auto 12pt auto} table.idx td{padding:1pt 4pt} table.idx td:first-child{text-align:right} table.idx td:last-child{text-align:left}
    .cap{text-align:center;text-align-last:center;margin:4pt 0 9pt 0}
    .fig{text-align:center;margin:6pt 0 0 0}
    .vp{overflow:hidden;width:100%;height:100%}
    .flow{column-width:${W_PT - 100}pt;column-gap:40pt;column-fill:auto;height:100%;width:${W_PT - 100}pt}`;
}

// ---- the scanner, in the page: skew, blur, noise, Otsu ------------------------------------------------------------------
async function scan(page, png, o) {
  return page.evaluate(async ([b64, o]) => {
    const img = document.createElement('img'); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const w = Math.round(img.width * o.scale), h = Math.round(img.height * o.scale);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h);
    x.translate(w / 2, h / 2); x.rotate(o.angle * Math.PI / 180); x.translate(-w / 2, -h / 2);
    x.filter = 'blur(' + o.blur + 'px)'; x.drawImage(img, 0, 0, w, h); x.filter = 'none';
    const d = x.getImageData(0, 0, w, h), g = new Uint8Array(w * h);
    let s = o.seed >>> 0;
    const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    const gauss = () => { const u = rnd() || 1e-9, v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    for (let i = 0; i < w * h; i++) g[i] = Math.max(0, Math.min(255, Math.round(0.299 * d.data[4 * i] + 0.587 * d.data[4 * i + 1] + 0.114 * d.data[4 * i + 2] + o.noise * gauss())));
    if (o.jpeg) {
      for (let i = 0; i < w * h; i++) { d.data[4 * i] = d.data[4 * i + 1] = d.data[4 * i + 2] = g[i]; d.data[4 * i + 3] = 255; }
      x.setTransform(1, 0, 0, 1, 0, 0); x.putImageData(d, 0, 0);
      return { w, h, jpeg: c.toDataURL('image/jpeg', o.jpeg).split(',')[1] };
    }
    // Otsu's threshold over the grey levels
    const hist = new Array(256).fill(0); for (let i = 0; i < w * h; i++) hist[g[i]]++;
    let sum = 0; for (let t = 0; t < 256; t++) sum += t * hist[t];
    let sb = 0, wb = 0, best = 0, th = 128;
    for (let t = 0; t < 256; t++) { wb += hist[t]; if (!wb) continue; const wf = w * h - wb; if (!wf) break; sb += t * hist[t]; const mb = sb / wb, mf = (sum - sb) / wf, v = wb * wf * (mb - mf) * (mb - mf); if (v > best) { best = v; th = t; } }
    // 1 bit a pixel, rows padded to a byte; 1 is white (DeviceGray)
    const rb = Math.ceil(w / 8), bits = new Uint8Array(rb * h);
    for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) if (g[y * w + xx] > th) bits[y * rb + (xx >> 3)] |= 0x80 >> (xx & 7);
    let bin = ''; for (let i = 0; i < bits.length; i += 32768) bin += String.fromCharCode.apply(null, bits.subarray(i, i + 32768));
    return { w, h, bits: btoa(bin) };
  }, [png.toString('base64'), o]);
}

// ---- a PDF of one image a page ------------------------------------------------------------------------------------------
function writePdf(file, pages, title) {
  const objs = [];
  const obj = (b) => { objs.push(Buffer.isBuffer(b) ? b : Buffer.from(b, 'latin1')); return objs.length; };
  const stream = (dict, data) => Buffer.concat([Buffer.from(dict.replace('%LEN%', data.length) + '\nstream\n', 'latin1'), data, Buffer.from('\nendstream', 'latin1')]);
  const np = pages.length, kids = [];
  // object numbers: per page an image and its content, then the pages, then Pages, Catalog, Info
  const ids = pages.map(() => ({}));
  pages.forEach((p, i) => {
    const im = p.jpeg ? stream(`<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length %LEN% >>`, Buffer.from(p.jpeg, 'base64'))
      : stream(`<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceGray /BitsPerComponent 1 /Filter /FlateDecode /Length %LEN% >>`, zlib.deflateSync(Buffer.from(p.bits, 'base64'), { level: 9 }));
    ids[i].im = obj(im);
    ids[i].c = obj(stream('<< /Length %LEN% >>', Buffer.from(`q\n${W_PT} 0 0 ${H_PT} 0 0 cm\n/Im0 Do\nQ\n`, 'latin1')));
  });
  const pagesNum = objs.length + np + 1;
  pages.forEach((p, i) => { kids.push(obj(`<< /Type /Page /Parent ${pagesNum} 0 R /MediaBox [0 0 ${W_PT} ${H_PT}] /Resources << /XObject << /Im0 ${ids[i].im} 0 R >> >> /Contents ${ids[i].c} 0 R >>`)); });
  if (obj(`<< /Type /Pages /Kids [${kids.map((k) => k + ' 0 R').join(' ')}] /Count ${np} >>`) !== pagesNum) throw new Error('object numbers');
  const cat = obj(`<< /Type /Catalog /Pages ${pagesNum} 0 R /Lang (fa-IR) >>`);
  const info = obj(`<< /Producer (${PRODUCER}) /Creator (${PRODUCER}) /Title (${title}) >>`);
  const parts = [Buffer.from('%PDF-1.5\n%\xe2\xe3\xcf\xd3\n', 'latin1')]; let off = parts[0].length; const offs = [];
  objs.forEach((b, i) => { const h = Buffer.from(`${i + 1} 0 obj\n`, 'latin1'), t = Buffer.from('\nendobj\n', 'latin1'); offs.push(off); parts.push(h, b, t); off += h.length + b.length + t.length; });
  const xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('') +
    `trailer\n<< /Size ${objs.length + 1} /Root ${cat} 0 R /Info ${info} 0 R >>\nstartxref\n${off}\n%%EOF\n`;
  parts.push(Buffer.from(xref, 'latin1'));
  fs.writeFileSync(file, Buffer.concat(parts)); console.log(path.relative(env.LAB, file), fs.statSync(file).size, 'bytes');
}

(async () => {
  const zip = await JSZip.loadAsync(fs.readFileSync(path.join(root, 'assets', 'fonts', 'download', 'persian-fonts-ttf.zip')));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kelk-scans-'));
  const font = async (name) => { const f = path.join(tmp, path.basename(name)); fs.writeFileSync(f, await zip.files[name].async('nodebuffer')); return f; };
  const F = { Nazanin: await font('borna-rayaneh/BNAZANIN.TTF'), Mitra: await font('borna-rayaneh/BMITRA.TTF'), Titr: await font('borna-rayaneh/BTITRBD.TTF'), Vazir: await font('vazirmatn/Vazirmatn-Regular.ttf') };
  const b = await chromium.launch(), page = await b.newPage({ viewport: { width: Math.round(W_PT * 96 / 72), height: Math.round(H_PT * 96 / 72) }, deviceScaleFactor: 300 / 96 });
  const shot = async (h) => { const f = path.join(tmp, 'p.html'); fs.writeFileSync(f, h); await page.goto(env.fileUrl(f)); await page.evaluate(() => document.fonts.ready); return page.screenshot({ type: 'png' }); };
  const P = (t) => `<p>${t}</p>`;
  const only = process.argv.slice(2);
  const want = (name) => !only.length || only.some((o) => name.indexOf(o) >= 0);
  const make = async (name, list, title) => {
    if (!want(name)) return;
    const pages = [];
    for (const [k, it] of list.entries()) pages.push(await scan(page, await shot(html(F, it.body, it.opts)), Object.assign({ seed: 1000 + k + name.length }, it.scan)));
    writePdf(env.pdfPath(name + '.pdf'), pages, title);
  };
  const S300 = { scale: 1, angle: 0.35, blur: 0.9, noise: 12 };
  await make('scan-300--scan-plain-fa', PLAIN.map((ps) => ({ body: ps.map(P).join(''), opts: { body: 'Nazanin' }, scan: S300 })), 'scan-plain-fa');
  await make('scan-300--scan-framed-fa', [{ body: FRAMED.map(P).join(''), opts: { body: 'Mitra', frame: true }, scan: Object.assign({}, S300, { angle: -0.5 }) }], 'scan-framed-fa');
  await make('scan-150--scan-low-fa', [{ body: LOW.map(P).join(''), opts: { body: 'Vazir', size: 11 }, scan: { scale: 0.5, angle: 0.2, blur: 0.6, noise: 8, jpeg: 0.35 } }], 'scan-low-fa');
  await make('scan-300--scan-columns-fa', [{ body: COLUMNS.map(P).join(''), opts: { body: 'Nazanin', size: 11, cols: 2 }, scan: Object.assign({}, S300, { angle: 0.3 }) }], 'scan-columns-fa');
  await make('scan-300--scan-headings-fa', [{ body: HEADINGS.map(([hd, p]) => `<h1>${hd}</h1>` + P(p)).join(''), opts: { body: 'Nazanin', head: 'Titr' }, scan: Object.assign({}, S300, { angle: 0.6 }) }], 'scan-headings-fa');
  // 3.6
  const NO = { body: 'Nazanin', head: 'Titr', rh: [] };
  const H1 = (t) => `<h1>${t}</h1>`;
  const li = (it) => `<li>${it[0]}${it[1] ? '<ul>' + it[1].map((x) => `<li>${x}</li>`).join('') + '</ul>' : ''}</li>`;
  await make('scan-300--scan-list-fa', [{ body: H1(LIST.title) + P(LIST.intro) + '<ol>' + LIST.items.map(li).join('') + '</ol>' + P(LIST.outro), opts: NO, scan: Object.assign({}, S300, { angle: 0.4 }) }], 'scan-list-fa');
  const rows = (rs) => rs.map((r) => '<tr>' + r.map((c) => `<td>${fa(c)}</td>`).join('') + '</tr>').join('');
  await make('scan-300--scan-table-fa', [{ body: H1(TABLE.title) + P(TABLE.intro) + `<p class="cap">${fa(TABLE.caption)}</p><table class="ruled">${rows(TABLE.rows)}</table>` + P(TABLE.outro), opts: NO, scan: Object.assign({}, S300, { angle: -0.3 }) }], 'scan-table-fa');
  await make('scan-300--scan-index-fa', [{ body: H1(INDEX.title) + `<table class="idx">${rows(INDEX.rows)}</table>`, opts: NO, scan: Object.assign({}, S300, { angle: 0.25 }) }], 'scan-index-fa');
  const flow = H1(HEADS.title) + HEADS.paras.map(P).join('');
  await make('scan-300--scan-heads-fa', [0, 1, 2].map((k) => ({
    body: `<div class="vp"><div class="flow" style="transform:translateX(${k * (W_PT - 60)}pt)">${flow}</div></div>`,
    opts: Object.assign({}, NO, { size: 13, rh: [HEADS.head, fa(String(HEADS.first + k))] }), scan: Object.assign({}, S300, { angle: [0.3, -0.35, 0.45][k] })
  })), 'scan-heads-fa');
  await make('scan-300--scan-picture-fa', [{ body: H1(PICTURE.title) + P(PICTURE.before) + `<div class="fig">${GARDEN}</div><p class="cap">${fa(PICTURE.caption)}</p>` + P(PICTURE.after), opts: NO, scan: Object.assign({}, S300, { angle: -0.4 }) }], 'scan-picture-fa');
  await make('scan-300--scan-columns2-fa', [{ body: H1(COLUMNS2.title) + `<div style="column-count:2;column-gap:26pt">${COLUMNS2.paras.map(P).join('')}</div>`, opts: Object.assign({}, NO, { size: 11, rh: [COLUMNS2.head, fa(String(COLUMNS2.page))] }), scan: Object.assign({}, S300, { angle: 0.3 }) }], 'scan-columns2-fa');
  const dust = DUST.map((d) => `<span style="position:absolute;left:${d[1]}pt;top:${d[2]}pt;font-family:Nazanin;font-size:14pt;line-height:1">${d[0]}</span>`).join('');
  const frameRh = (k) => `<div style="display:flex;justify-content:space-between;font-family:Nazanin;font-size:10pt;border-bottom:2.5pt solid #000;padding-bottom:3pt;margin-bottom:12pt"><span>${FRAME.head}</span><span>${fa(String(FRAME.first + k))}</span></div>`;
  await make('scan-300--scan-pageframe-fa', [0, 1].map((k) => ({ body: `<div style="border:1.5pt solid #000;padding:12pt 14pt;height:calc(100% - 30pt)">${frameRh(k)}${FRAME.paras[k].map(P).join('')}</div>`, opts: NO, scan: Object.assign({}, S300, { angle: [0.2, -0.3][k] }) })), 'scan-pageframe-fa');
  // 3.6's fixes (PR 4)
  const dots = DOTS.map((d) => `<span style="position:absolute;left:${d[0]}pt;top:${d[1]}pt;width:1.5pt;height:1.5pt;border-radius:50%;background:#000"></span>`).join('');
  await make('scan-300--scan-dust-fa', [{ body: H1(DUSTP.title) + P(DUSTP.p1) + '<ul>' + DUSTP.items.map((x) => `<li>${x}</li>`).join('') + '</ul>' + P(DUSTP.p2) + dots, opts: NO, scan: Object.assign({}, S300, { angle: -0.2 }) }], 'scan-dust-fa');
  const hatch = (h) => `<svg xmlns="http://www.w3.org/2000/svg" width="296pt" height="${h}pt" viewBox="0 0 296 ${h}"><defs><pattern id="c${h}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="#000" stroke-width="2"/></pattern></defs><rect width="296" height="${h}" fill="url(#c${h})"/></svg>`;
  await make('scan-300--scan-cover-fa', [{ body: `<div style="border:1.5pt solid #000;padding:6pt;height:calc(100% - 20pt)">${hatch(110)}<h1 style="text-align:center;font-size:24pt;margin:30pt 0 6pt 0">${COVER.title}</h1><p class="cap" style="font-size:15pt">${COVER.sub}</p><p class="cap" style="margin-top:60pt">${COVER.credit}</p>${COVER.more.map((x) => `<p class="cap">${x}</p>`).join('')}</div>`, opts: NO, scan: Object.assign({}, S300, { angle: 0.2 }) }], 'scan-cover-fa');
  // (a garden's plan with its labels in a row of their own inside its frame — the rows a label shares with the drawing's
  // ink are read with it, as the drawing)
  const labelled = '<svg xmlns="http://www.w3.org/2000/svg" width="240pt" height="170pt" viewBox="0 0 240 170"><defs><pattern id="lh" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5" stroke="#000" stroke-width="1.6"/></pattern></defs>' +
    '<rect x="6" y="6" width="228" height="158" fill="none" stroke="#000" stroke-width="3"/>' +
    `<text x="170" y="30" font-family="Nazanin" font-size="13" text-anchor="middle">${LABELS.labels[0]}</text><text x="70" y="30" font-family="Nazanin" font-size="13" text-anchor="middle">${LABELS.labels[1]}</text>` +
    '<path d="M120 50 V82 M120 122 V160 M10 102 H98 M142 102 H230" stroke="#000" stroke-width="7" fill="none"/><circle cx="120" cy="102" r="20" fill="none" stroke="#000" stroke-width="3"/><circle cx="120" cy="102" r="10" fill="#000"/>' +
    [[50, 70], [90, 70], [150, 70], [190, 70], [50, 136], [90, 136], [150, 136], [190, 136]].map((c) => `<circle cx="${c[0]}" cy="${c[1]}" r="11" fill="url(#lh)" stroke="#000" stroke-width="1.6"/>`).join('') + '</svg>';
  await make('scan-300--scan-labels-fa', [{ body: H1(LABELS.title) + P(LABELS.before) + `<div class="fig">${labelled}</div>` + P(LABELS.after), opts: NO, scan: Object.assign({}, S300, { angle: -0.3 }) }], 'scan-labels-fa');
  await make('scan-300--scan-sideways-fa', [{ body: `<p class="cap">${fa(SIDEWAYS.title)}</p><div style="position:absolute;top:90pt;left:360pt;transform-origin:top left;transform:rotate(90deg);width:470pt"><table class="ruled" style="width:470pt">${rows(SIDEWAYS.rows)}</table></div>`, opts: NO, scan: Object.assign({}, S300, { angle: 0.2 }) }], 'scan-sideways-fa');
  await make('scan-300--scan-specks-fa', [{ body: H1(SPECKS.title) + SPECKS.paras.map(P).join('') + dust, opts: NO, scan: Object.assign({}, S300, { angle: 0.2 }) }], 'scan-specks-fa');
  await b.close();
  const md = (ps) => ps.join('\n\n') + '\n';
  const corpus = (n, t) => { if (!want(n.replace(/\.md$/, ''))) return; fs.writeFileSync(path.join(env.LAB, 'corpus', n), t); console.log('corpus/' + n); };
  corpus('scan-plain-fa.md', md([].concat(...PLAIN)));
  corpus('scan-framed-fa.md', md(FRAMED));
  corpus('scan-columns-fa.md', md(COLUMNS));
  corpus('scan-low-fa.md', md(LOW));
  corpus('scan-headings-fa.md', HEADINGS.map(([hd, p]) => '# ' + hd + '\n\n' + p).join('\n\n') + '\n');
  const mdItem = (it, k) => `${k + 1}. ${it[0]}` + (it[1] ? it[1].map((x) => `\n   - ${x}`).join('') : '');
  corpus('scan-list-fa.md', md(['# ' + LIST.title, LIST.intro, LIST.items.map(mdItem).join('\n'), LIST.outro]));
  const gfm = (rs) => [rs[0], rs[0].map(() => '---')].concat(rs.slice(1)).map((r) => '| ' + r.join(' | ') + ' |').join('\n');
  corpus('scan-table-fa.md', md(['# ' + TABLE.title, TABLE.intro, '**' + TABLE.caption + '**', gfm(TABLE.rows), TABLE.outro]));
  corpus('scan-index-fa.md', md(['# ' + INDEX.title, gfm(INDEX.rows)]));
  corpus('scan-heads-fa.md', md(['# ' + HEADS.title].concat(HEADS.paras)));
  corpus('scan-picture-fa.md', md(['# ' + PICTURE.title, PICTURE.before, PICTURE.caption, PICTURE.after]));
  corpus('scan-pageframe-fa.md', md(FRAME.paras[0].concat(FRAME.paras[1])));
  corpus('scan-dust-fa.md', md(['# ' + DUSTP.title, DUSTP.p1, DUSTP.items.map((x) => '- ' + x).join('\n'), DUSTP.p2]));
  corpus('scan-cover-fa.md', md(['# ' + COVER.title, COVER.sub, COVER.credit].concat(COVER.more)));
  corpus('scan-labels-fa.md', md(['# ' + LABELS.title, LABELS.before, LABELS.after]));
  corpus('scan-sideways-fa.md', md(['**' + SIDEWAYS.title + '**']));
  corpus('scan-specks-fa.md', md(['# ' + SPECKS.title].concat(SPECKS.paras)));
  corpus('scan-columns2-fa.md', md(['# ' + COLUMNS2.title].concat(COLUMNS2.paras)));
  fs.rmSync(tmp, { recursive: true, force: true });
})();
