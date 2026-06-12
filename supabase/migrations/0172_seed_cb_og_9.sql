-- =============================================================================
-- Migration: 0172_seed_cb_og_9.sql
-- Purpose:   Seed "CB OG #9" (College Board linear Digital SAT practice test,
--            66 RW + 54 Math = 120 Q) into the full-test tables from 0048.
--   Source:  sat-practice-test-9-digital.pdf; official College Board answer key (pdf/Key/).
--   Idempotent upsert on (slug)/(test_id,position)/(module_id,position).
-- =============================================================================
DO $seed$
DECLARE v_test uuid; v_mod uuid;
BEGIN
  INSERT INTO public.tests (slug, ordinal, title, short_title, source, total_questions)
  VALUES ('cb-og-9', 15, 'CB OG #9', 'CB OG #9', 'sat-practice-test-9-digital.pdf', 120)
  ON CONFLICT (slug) DO UPDATE SET ordinal=EXCLUDED.ordinal, title=EXCLUDED.title,
    short_title=EXCLUDED.short_title, source=EXCLUDED.source, total_questions=EXCLUDED.total_questions
  RETURNING id INTO v_test;

  INSERT INTO public.test_modules (test_id, position, section, label, time_limit_seconds, question_count)
  VALUES (v_test, 1, 'reading-writing', 'Reading and Writing — Module 1', 1920, 33)
  ON CONFLICT (test_id, position) DO UPDATE SET section=EXCLUDED.section, label=EXCLUDED.label,
    time_limit_seconds=EXCLUDED.time_limit_seconds, question_count=EXCLUDED.question_count
  RETURNING id INTO v_mod;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 1, '1-1', 1, 'mcq', 'The following text is adapted from Ida B. Wells''s 1970 autobiography A Crusade for Justice. Mr. Watts is a reference to George Frederic Watts, an English painter.

[Manchester''s] art galleries are so arranged that the name of every picture is plainly seen and one has no need of a catalogue to pick out the name and the artist. This is a convenience to the general public, which other art galleries, which shall be nameless, might copy to advantage. To her treasure of art Manchester has added Mr. Watts'' latest picture, the Good Samaritan.', NULL, 'As used in the text, what does the word "arranged" most nearly mean?', '{"A":"Organized","B":"Ranked","C":"Scheduled","D":"Discussed"}'::jsonb, NULL, 'A', NULL, NULL, 4)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 2, '1-2', 2, 'mcq', 'One challenge of generating electricity from ocean waves is that wave power isn''t ______: it varies in unpredictable ways that pose technological and planning problems for electricity generation.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"accidental","B":"confident","C":"expensive","D":"consistent"}'::jsonb, NULL, 'D', NULL, NULL, 4)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 3, '1-3', 3, 'mcq', 'Due to their often strange images, highly experimental syntax, and opaque subject matter, many of John Ashbery''s poems can be quite difficult to ______ and thus are the object of heated debate among scholars.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"delegate","B":"compose","C":"interpret","D":"renounce"}'::jsonb, NULL, 'C', NULL, NULL, 4)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 4, '1-4', 4, 'mcq', 'Diego Velázquez was the leading artist in the court of King Philip IV of Spain during the seventeenth century, but his influence was hardly ______ Spain: realist and impressionist painters around the world employed his techniques and echoed elements of his style.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"derived from","B":"recognized in","C":"confined to","D":"repressed by"}'::jsonb, NULL, 'C', NULL, NULL, 5)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 5, '1-5', 5, 'mcq', 'Although science fiction was dominated mostly by white male authors when Octavia Butler, a Black woman, began writing, she did not view the genre as ______: Butler broke into the field with the publication of several short stories and her 1976 novel Patternmaster, and she later became the first science fiction writer to win a prestigious MacArthur Fellowship.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"legitimate","B":"impenetrable","C":"compelling","D":"indecipherable"}'::jsonb, NULL, 'B', NULL, NULL, 5)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 6, '1-6', 6, 'mcq', 'The following text is adapted from Cynthia Kadohata''s 2004 novel Kira-Kira.

[Uncle Katsuhisa] was as loud as my father was quiet. <u>Even when he wasn''t talking, he made a lot of noise, clearing his throat and sniffing and tapping his fingers.</u>

©2004 by Cynthia Kadohata', NULL, 'Which choice best describes the function of the underlined sentence?', '{"A":"It lists the kinds of topics Uncle Katsuhisa enjoys discussing.","B":"It suggests that Uncle Katsuhisa dislikes meeting new people.","C":"It contrasts Uncle Katsuhisa with the narrator''s father.","D":"It describes a conversation between the narrator and the narrator''s father."}'::jsonb, NULL, 'C', NULL, NULL, 5)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 7, '1-7', 7, 'mcq', 'Wakako Yamauchi is best known for And the Soul Shall Dance, her 1977 play about a Japanese American family in Southern California. The play is based on a short story Yamauchi had published three years earlier. Adapting the story wasn''t easy. Theater relies on dialogue between characters, but the original story features little dialogue and instead describes its characters'' silent thoughts. <u>To transform the story into a play, Yamauchi created situations where characters reveal their thoughts by speaking them aloud during conversations with each other.</u>', NULL, 'Which choice best describes the function of the underlined sentence in the text as a whole?', '{"A":"It offers information about how Yamauchi adapted her short story into a play.","B":"It argues that Yamauchi''s play influenced later playwrights.","C":"It explains why Yamauchi''s short story is better known than the play adaptation is.","D":"It describes how Yamauchi chose the actors who performed in the play."}'::jsonb, NULL, 'A', NULL, NULL, 5)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 8, '1-8', 8, 'mcq', 'In response to concerns that some recent financial crises were exacerbated by consumers misunderstanding risks associated with credit cards, loans, and other financial products, policymakers in many countries have instituted risk-disclosure requirements on sellers of those products. Enrique Seira et al. investigated a variety of risk-disclosure messages sent to thousands of credit card customers and found that the messages had only small and short-lived effects on behavior. Seira et al. asserted that such effects may nevertheless be worth pursuing, <u>given the negligible cost of messaging</u>.', NULL, 'Which choice best describes the function of the underlined portion in the text as a whole?', '{"A":"It notes a factor that led Seira et al. to not dismiss risk-disclosure messaging altogether despite their evidence of its limited utility.","B":"It acknowledges a type of risk-disclosure messaging that Seira et al. may not have fully accounted for in their study.","C":"It describes a consideration that explains why Seira et al. recommended risk-disclosure messaging even though its effects may be small relative to its costs.","D":"It points out a circumstance that Seira et al. conceded may make risk-disclosure messaging more effective than their study suggests."}'::jsonb, NULL, 'A', NULL, NULL, 6)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 9, '1-9', 9, 'mcq', 'Text 1
When companies in the same industry propose merging with one another, they often claim that the merger will benefit consumers by increasing efficiency and therefore lowering prices. Economist Ying Fan investigated this notion in the context of the United States newspaper market. She modeled a hypothetical merger of Minneapolis-area newspapers and found that subscription prices would rise following a merger.

Text 2
Economists Dario Focarelli and Fabio Panetta have argued that research on the effect of mergers on prices has focused excessively on short-term effects, which tend to be adverse for consumers. Using the case of consumer banking in Italy, they show that over the long term (several years, in their study), the efficiency gains realized by merged companies do result in economic benefits for consumers.', NULL, 'Based on the texts, how would Focarelli and Panetta (Text 2) most likely respond to Fan''s findings (Text 1)?', '{"A":"They would recommend that Fan compare the near-term effect of a merger on subscription prices in the Minneapolis area with the effect of a merger in another newspaper market.","B":"They would argue that over the long term the expenses incurred by the merged newspaper company will also increase.","C":"They would encourage Fan to investigate whether the projected effect on subscription prices persists over an extended period.","D":"They would claim that mergers have a different effect on consumer prices in the newspaper industry than in most other industries."}'::jsonb, NULL, 'C', NULL, NULL, 6)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 10, '1-10', 10, 'mcq', 'Utah is home to Pando, a colony of about 47,000 quaking aspen trees that all share a single root system. Pando is one of the largest single organisms by mass on Earth, but ecologists are worried that its growth is declining in part because of grazing by animals. The ecologists say that strong fences could prevent deer from eating young trees and help Pando start thriving again.', NULL, 'According to the text, why are ecologists worried about Pando?', '{"A":"It isn''t growing at the same rate it used to.","B":"It isn''t producing young trees anymore.","C":"It can''t grow into new areas because it is blocked by fences.","D":"Its root system can''t support many more new trees."}'::jsonb, NULL, 'A', NULL, NULL, 7)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 11, '1-11', 11, 'mcq', 'Recordings of Female Bottlenose Dolphins with Their Calves

Dolphin ID | Recording year
FB07 | 2012
FB25 | 1989
FB43 | 1992
FB79 | 2018

In a study of bottlenose dolphins, biologist Laela S. Sayigh and a team of researchers analyzed recordings of female bottlenose dolphins interacting with their calves.', NULL, 'According to the table, in which year was the dolphin with the ID FB43 recorded with her calf?', '{"A":"1999","B":"2012","C":"2020","D":"1992"}'::jsonb, NULL, 'D', NULL, NULL, 7)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 12, '1-12', 12, 'mcq', 'Maximum Height of Maple Trees When Fully Grown

Tree type | Maximum height (feet) | Native to North America
Sugar maple | 75 | yes
Silver maple | 70 | yes
Red maple | 60 | yes
Japanese maple | 25 | no
Norway maple | 50 | no

For a school project, a forestry student needs to recommend a maple tree that is native to North America and won''t grow more than 60 feet in height. Based on the characteristics of five common maple trees, she has decided to select a ______', NULL, 'Which choice most effectively uses data from the table to complete the text?', '{"A":"silver maple.","B":"sugar maple.","C":"red maple.","D":"Norway maple."}'::jsonb, NULL, 'C', NULL, NULL, 7)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 13, '1-13', 13, 'mcq', 'Many plants lose their leaf color when exposed to kanamycin, an antibiotic produced by some soil microorganisms. Spelman College biologist Mentewab Ayalew and her colleagues hypothesized that plants'' response to kanamycin exposure involves altering their uptake of metals, such as iron and zinc. The researchers grew two groups of seedlings of the plant Arabidopsis thaliana, half of which were exposed to kanamycin and half of which were a control group without exposure to kanamycin, and measured the plants'' metal content five days after germination.', 'Bar graph titled "Metal Content of Plants with and without Kanamycin Exposure." Y-axis: Metal content (parts per million), 0 to 700. X-axis: Experimental condition (without kanamycin, with kanamycin). Bars show iron and zinc levels for each condition (legend: zinc, iron).', 'Which choice best describes data in the graph that support Ayalew and her colleagues'' hypothesis?', '{"A":"The control plants contained higher levels of zinc than iron, but plants exposed to kanamycin contained higher levels of iron than zinc.","B":"Both groups of plants contained more than 200 parts per million of both iron and zinc.","C":"Zinc levels were around 300 parts per million in the control plants but nearly 400 parts per million in the plants exposed to kanamycin.","D":"The plants exposed to kanamycin showed lower levels of iron and zinc than the control plants did."}'::jsonb, '/data/tests/cb-og-9/figures/m1-q13.png', 'D', NULL, NULL, 8)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 14, '1-14', 14, 'mcq', 'Average Number and Duration of Torpor Bouts and Arousal Episodes for Alaska Marmots and Arctic Ground Squirrels, 2008–2011

Feature | Alaska marmots | Arctic ground squirrels
torpor bouts | 12 | 10.5
duration per bout | 13.81 days | 16.77 days
arousal episodes | 11 | 9.5
duration per episode | 21.2 hours | 14.2 hours

When hibernating, Alaska marmots and Arctic ground squirrels enter a state called torpor, which minimizes the energy their bodies need to function. Often a hibernating animal will temporarily come out of torpor (called an arousal episode) and its metabolic rate will rise, burning more of the precious energy the animal needs to survive the winter. Alaska marmots hibernate in groups and therefore burn less energy keeping warm during these episodes than they would if they were alone. A researcher hypothesized that because Arctic ground squirrels hibernate alone, they would likely exhibit longer bouts of torpor and shorter arousal episodes than Alaska marmots.', NULL, 'Which choice best describes data from the table that support the researcher''s hypothesis?', '{"A":"The Alaska marmots'' arousal episodes lasted for days, while the Arctic ground squirrels'' arousal episodes lasted less than a day.","B":"The Alaska marmots and the Arctic ground squirrels both maintained torpor for several consecutive days per bout, on average.","C":"The Alaska marmots had shorter torpor bouts and longer arousal episodes than the Arctic ground squirrels did.","D":"The Alaska marmots had more torpor bouts than arousal episodes, but their arousal episodes were much shorter than their torpor bouts."}'::jsonb, NULL, 'C', NULL, NULL, 9)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 15, '1-15', 15, 'mcq', 'Honeybee hives consist mainly of hexagonal (six-sided) units called cells, in which queens lay eggs. Hexagonal cells for eggs that develop into nonreproductive workers are smaller than those for eggs that develop into reproductive drones, though the size difference varies by species. Difference in cell size results in a construction problem—it''s hard to neatly connect sections of small cells to sections of large cells—that worsens as the difference increases. To fill in gaps between the sections when building a hive, bees rely on cells that have more or fewer than six sides. A student studying beehive structure consults data on three species, concluding that ______', 'Bar graph titled "Percentage of Nonhexagonal Cells in Hives of Three Honeybee Species." Y-axis: Average percentage of nonhexagonal cells, 0 to 3.0. X-axis: Species (black dwarf honeybee, dwarf honeybee, western honeybee). Bars grouped by cell type (legend: 5-sided cells, 7-sided cells, 8-sided cells).', 'Which choice most effectively uses data from the graph to complete the student''s conclusion?', '{"A":"cells for worker eggs are probably closer in size to cells for drone eggs in the hives of the western honeybee than in the hives of the dwarf honeybee and the black dwarf honeybee.","B":"both the western honeybee and the black dwarf honeybee probably reserve eight-sided cells for drone eggs, while the dwarf honeybee likely deposits drone eggs in seven-sided cells.","C":"the western honeybee probably relies on many more geometrical shapes when constructing cells than either the dwarf honeybee or the black dwarf honeybee does.","D":"the percentage of hexagonal cells is probably slightly lower in the hives of the western honeybee than in the hives of the dwarf honeybee and the black dwarf honeybee."}'::jsonb, '/data/tests/cb-og-9/figures/m1-q15.png', 'A', NULL, NULL, 10)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 16, '1-16', 16, 'mcq', 'ALSOL is a microcredit program in Mexico that makes small loans to female entrepreneurs who lack the collateral and credit history to secure financing from conventional banks. Borrowers use their business proceeds to repay loans in equal weekly installments and incur no penalty for missed payments other than lack of access to larger loans. Economists Gustavo Barboza and Sandra Trejos analyzed ALSOL data and found that rural borrowers, who mostly make and sell handicrafts, miss payments more often than urban borrowers do, partly because they sell their goods less frequently than they could. Barboza and Trejos claim that this behavior reflects strategic decisions that enable rural women to increase their profits per unit sold.', NULL, 'Which finding, if true, would most directly support Barboza and Trejos''s claim?', '{"A":"Many marketplaces require entrepreneurs to pay marketplace operators a fixed percentage of each day''s proceeds in exchange for permission to sell goods there.","B":"Rural entrepreneurs can typically sell their goods for higher prices in cities than in their home areas, but the number of people selling competing goods tends to be higher in cities.","C":"Due to the lower costs they incur, rural entrepreneurs tend to require smaller initial loans than urban entrepreneurs do.","D":"The cost to rural entrepreneurs to bring their goods to towns with marketplaces is high but largely independent of the number of goods they bring."}'::jsonb, NULL, 'D', NULL, NULL, 11)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 17, '1-17', 17, 'mcq', 'In documents called judicial opinions, judges explain the reasoning behind their legal rulings, and in those explanations they sometimes cite and discuss historical and contemporary philosophers. Legal scholar and philosopher Anita L. Allen argues that while judges are naturally inclined to mention philosophers whose views align with their own positions, the strongest judicial opinions consider and rebut potential objections; discussing philosophers whose views conflict with judges'' views could therefore ______', NULL, 'Which choice most logically completes the text?', '{"A":"allow judges to craft judicial opinions without needing to consult philosophical works.","B":"help judges improve the arguments they put forward in their judicial opinions.","C":"make judicial opinions more comprehensible to readers without legal or philosophical training.","D":"bring judicial opinions in line with views that are broadly held among philosophers."}'::jsonb, NULL, 'B', NULL, NULL, 11)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 18, '1-18', 18, 'mcq', 'Although military veterans make up a small proportion of the total population of the United States, they occupy a significantly higher proportion of the jobs in the civilian government. One possible explanation for this disproportionate representation is that military service familiarizes people with certain organizational structures that are also reflected in the civilian government bureaucracy, and this familiarity thus ______', NULL, 'Which choice most logically completes the text?', '{"A":"makes civilian government jobs especially appealing to military veterans.","B":"alters the typical relationship between military service and subsequent career preferences.","C":"encourages nonveterans applying for civilian government jobs to consider military service instead.","D":"increases the number of civilian government jobs that require some amount of military experience to perform."}'::jsonb, NULL, 'A', NULL, NULL, 12)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 19, '1-19', 19, 'mcq', 'A member of the Cherokee Nation, Mary Golda Ross is renowned for her contributions to NASA''s Planetary Flight Handbook, which ______ detailed mathematical guidance for missions to Mars and Venus.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"provided","B":"having provided","C":"to provide","D":"providing"}'::jsonb, NULL, 'A', NULL, NULL, 12)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 20, '1-20', 20, 'mcq', 'The classic children''s board game Chutes and Ladders is a version of an ancient Nepalese game, Paramapada Sopanapata. In both games, players encounter "good" or "bad" spaces while traveling along a path; landing on one of the good spaces ______ a player to skip ahead and arrive closer to the end goal.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"allows","B":"are allowing","C":"have allowed","D":"allow"}'::jsonb, NULL, 'A', NULL, NULL, 12)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 21, '1-21', 21, 'mcq', 'In 1930, Japanese American artist Chiura Obata depicted the natural beauty of Yosemite National Park in two memorable woodcuts: Evening at Carl Inn and Lake Basin in the High Sierra. In 2019, ______ exhibited alongside 150 of Obata''s other works in a single-artist show at the Smithsonian American Art Museum.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"it was","B":"they were","C":"this was","D":"some were"}'::jsonb, NULL, 'B', NULL, NULL, 12)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 22, '1-22', 22, 'mcq', 'Journalists have dubbed Gil Scott-Heron the "godfather of rap," a title that has appeared in hundreds of articles about him since the 1990s. Scott-Heron himself resisted the godfather ______ feeling that it didn''t encapsulate his devotion to the broader African American blues music tradition as well as "bluesologist," the moniker he preferred.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"nickname, however","B":"nickname, however;","C":"nickname, however,","D":"nickname; however,"}'::jsonb, NULL, 'C', NULL, NULL, 13)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 23, '1-23', 23, 'mcq', 'Stomata, tiny pore structures in a leaf that absorb gases needed for plant growth, open when guard cells surrounding each pore swell with water. In a pivotal 2007 article, plant cell ______ showed that lipid molecules called phosphatidylinositol phosphates are responsible for signaling guard cells to open stomata.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"biologist, Yuree Lee","B":"biologist Yuree Lee,","C":"biologist Yuree Lee","D":"biologist, Yuree Lee,"}'::jsonb, NULL, 'C', NULL, NULL, 13)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 24, '1-24', 24, 'mcq', 'As cheesemaking practices spread throughout Europe and Asia during and after the Neolithic, divergent strategies for preserving milk ______ whereas rennet-coagulated cheesemaking became key to milk preservation in Europe and Southwest Asia, acid-heat coagulation methods became common among nomadic herding populations of the northeastern Eurasian steppe.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"emerged","B":"emerged and","C":"emerged:","D":"emerged,"}'::jsonb, NULL, 'C', NULL, NULL, 13)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 25, '1-25', 25, 'mcq', 'Recent pollen analyses of the Aran Islands have led some researchers to propose that the now treeless islands were once wooded. This hypothesis ______ that certain trees, such as P. sylvestris, survived without interruption or human intervention throughout the Holocene cannot stand, researchers Michael O''Connell and Karen Molloy counter, unless other explanations can first be ruled out.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"suggesting","B":"suggested","C":"suggests","D":"has suggested"}'::jsonb, NULL, 'A', NULL, NULL, 13)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 26, '1-26', 26, 'mcq', 'Researchers studying the "terra-cotta army," the thousands of life-size statues of warriors found interred near the tomb of Emperor Qin Shi Huang of China, were shocked to realize that the shape of each statue''s ears, like the shape of each person''s ears, ______ unique.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"are","B":"is","C":"were","D":"have been"}'::jsonb, NULL, 'B', NULL, NULL, 14)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 27, '1-27', 27, 'mcq', 'Chimamanda Ngozi Adichie''s 2013 novel Americanah chronicles the divergent experiences of Ifemelu and Obinze, a young Nigerian couple, after high school. Ifemelu moves to the United States to attend a prestigious university. ______ Obinze travels to London, hoping to start a career there. However, frustrated with the lack of opportunities, he soon returns to Nigeria.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"Meanwhile,","B":"Nevertheless,","C":"Secondly,","D":"In fact,"}'::jsonb, NULL, 'A', NULL, NULL, 14)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 28, '1-28', 28, 'mcq', 'Some members of the US Supreme Court have resisted calls to televise the court''s oral arguments, concerned that the participants would be tempted to perform for the cameras (and thus lower the quality of the discourse). ______ the justices worry that most viewers would not even watch the full deliberations, only short clips that could be misinterpreted and mischaracterized.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"However,","B":"Additionally,","C":"In comparison,","D":"For example,"}'::jsonb, NULL, 'B', NULL, NULL, 14)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 29, '1-29', 29, 'mcq', 'The more diverse and wide ranging an animal''s behaviors, the larger and more energy demanding the animal''s brain tends to be. ______ from an evolutionary perspective, animals that perform only basic actions should allocate fewer resources to growing and maintaining brain tissue. The specialized subtypes of ants within colonies provide an opportunity to explore this hypothesis.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"Subsequently,","B":"Besides,","C":"Nevertheless,","D":"Thus,"}'::jsonb, NULL, 'D', NULL, NULL, 14)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 30, '1-30', 30, 'mcq', 'A firefly uses specialized muscles to draw oxygen into its lower abdomen through narrow tubes, triggering a chemical reaction whereby the oxygen combines with chemicals in the firefly''s abdomen to produce a glow. ______ when the firefly stops drawing in oxygen, the reaction—and the glow—cease.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"For instance,","B":"By contrast,","C":"Specifically,","D":"In conclusion,"}'::jsonb, NULL, 'B', NULL, NULL, 15)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 31, '1-31', 31, 'mcq', 'While researching a topic, a student has taken the following notes:
• NASA uses rovers, large remote vehicles with wheels, to explore the surface of Mars.
• NASA''s rovers can''t explore regions inaccessible to wheeled vehicles.
• Rovers are also heavy, making them difficult to land on the planet''s surface.
• Microprobes, robotic probes that weigh as little as 50 milligrams, could be deployed virtually anywhere on the surface of Mars.
• Microprobes have been proposed as an alternative to rovers.', NULL, 'The student wants to explain an advantage of microprobes. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"Despite being heavy, NASA''s rovers can land successfully on the surface of Mars.","B":"Microprobes, which weigh as little as 50 milligrams, could explore areas of Mars that are inaccessible to NASA''s heavy, wheeled rovers.","C":"NASA currently uses its rovers on Mars, but microprobes have been proposed as an alternative.","D":"Though they are different sizes, both microprobes and rovers can be used to explore the surface of Mars."}'::jsonb, NULL, 'B', NULL, NULL, 15)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 32, '1-32', 32, 'mcq', 'While researching a topic, a student has taken the following notes:
• Severo Ochoa discovered the enzyme PNPase in 1955.
• PNPase is involved in both the creation and degradation of mRNA.
• Ochoa incorrectly hypothesized that PNPase provides the genetic blueprints for mRNA.
• The discovery of PNPase proved critical to deciphering the human genetic code.
• Deciphering the genetic code has led to a better understanding of how genetic variations affect human health.', NULL, 'The student wants to emphasize the significance of Ochoa''s discovery. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"Ochoa''s 1955 discovery of PNPase proved critical to deciphering the human genetic code, leading to a better understanding of how genetic variations affect human health.","B":"Ochoa first discovered PNPase, an enzyme that he hypothesized contained the genetic blueprints for mRNA, in 1955.","C":"In 1955, Ochoa discovered the PNPase enzyme, which is involved in both the creation and degradation of mRNA.","D":"Though his discovery of PNPase was critical to deciphering the human genetic code, Ochoa incorrectly hypothesized that the enzyme was the source of mRNA''s genetic blueprints."}'::jsonb, NULL, 'A', NULL, NULL, 16)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 33, '1-33', 33, 'mcq', 'While researching a topic, a student has taken the following notes:
• Cecilia Vicuña is a multidisciplinary artist.
• In 1971, her first solo art exhibition, Pinturas, poemas y explicaciones, was shown at the Museo Nacional de Bellas Artes in Santiago, Chile.
• Her poetry collection Precario/Precarious was published in 1983 by Tanam Press.
• Her poetry collection Instan was published in 2002 by Kelsey St. Press.
• She lives part time in Chile, where she was born, and part time in New York.', NULL, 'The student wants to introduce the artist''s 1983 poetry collection. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"Before she published the books Precario/Precarious (1983) and Instan (2002), Cecilia Vicuña exhibited visual art at the Museo Nacional de Bellas Artes in Santiago, Chile.","B":"Cecilia Vicuña is a true multidisciplinary artist whose works include numerous poetry collections and visual art exhibitions.","C":"Published in 1983 by Tanam Press, Precario/Precarious is a collection of poetry by the multidisciplinary artist Cecilia Vicuña.","D":"In 1971, Cecilia Vicuña exhibited her first solo art exhibition, Pinturas, poemas y explicaciones, in Chile, her country of birth."}'::jsonb, NULL, 'C', NULL, NULL, 16)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;

  INSERT INTO public.test_modules (test_id, position, section, label, time_limit_seconds, question_count)
  VALUES (v_test, 2, 'reading-writing', 'Reading and Writing — Module 2', 1920, 33)
  ON CONFLICT (test_id, position) DO UPDATE SET section=EXCLUDED.section, label=EXCLUDED.label,
    time_limit_seconds=EXCLUDED.time_limit_seconds, question_count=EXCLUDED.question_count
  RETURNING id INTO v_mod;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 1, '2-1', 1, 'mcq', 'The following text is from Anita Desai''s 2011 novella Translator Translated. While working on her translation of a novel written in Odia (a language of India) into English, the narrator looks out her window at night to clear her mind.

I tried to distract myself with these sights of the ordinary world, but in my mind it was the lines I had been translating and the lines that I had been writing that remained in the forefront. I longed for sleep to obliterate them but it eluded me. Perhaps everything would be normal again once I had sent off the manuscript, I thought, and looked forward to completing the work.

©2011 by Anita Desai', NULL, 'As used in the text, what does the word “completing” most nearly mean?', '{"A":"Destroying","B":"Finishing","C":"Advertising","D":"Rejecting"}'::jsonb, NULL, 'B', NULL, NULL, 18)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 2, '2-2', 2, 'mcq', 'Predatory animals differ widely in how they ______ food for their young. Some leave dead prey nearby for their young to consume, some bring live prey to their young, and some feed their young directly from their own mouths.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"avoid","B":"guess","C":"provide","D":"describe"}'::jsonb, NULL, 'C', NULL, NULL, 18)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 3, '2-3', 3, 'mcq', 'Nigerian American author Teju Cole''s ______ his two passions—photography and the written word—culminates in his 2017 book, Blind Spot, which evocatively combines his original photographs from his travels with his poetic prose.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"indifference to","B":"enthusiasm for","C":"concern about","D":"surprise at"}'::jsonb, NULL, 'B', NULL, NULL, 18)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 4, '2-4', 4, 'mcq', 'Artist Marilyn Dingle''s intricate, coiled baskets are ______ sweetgrass and palmetto palm. Following a Gullah technique that originated in West Africa, Dingle skillfully winds a thin palm frond around a bunch of sweetgrass with the help of a “sewing bone” to create the basket''s signature look that no factory can reproduce.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"indicated by","B":"handmade from","C":"represented by","D":"collected with"}'::jsonb, NULL, 'B', NULL, NULL, 19)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 5, '2-5', 5, 'mcq', 'Beginning in the 1950s, Navajo Nation legislator Annie Dodge Wauneka continuously worked to promote public health; this ______ effort involved traveling throughout the vast Navajo homeland and writing a medical dictionary for speakers of Diné bizaad, the Navajo language.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"impartial","B":"offhand","C":"persistent","D":"mandatory"}'::jsonb, NULL, 'C', NULL, NULL, 19)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 6, '2-6', 6, 'mcq', 'Oral histories—whether they consist of interviews or recordings of songs and stories—can offer researchers a rich view of people''s everyday experiences. For her book about coal mining communities in Kentucky during the twentieth century, Karida Brown therefore relied in part on interviews with coal miners and their families. <u>By doing so, she gained valuable insights into her subjects'' day-to-day lives.</u>', NULL, 'Which choice best describes the function of the underlined sentence in the text as a whole?', '{"A":"It provides a little-known geographical fact about Kentucky.","B":"It argues that Karida Brown is an expert on United States politics.","C":"It presents a major historical event that took place in the twentieth century.","D":"It describes how Karida Brown benefited from incorporating oral history in her book."}'::jsonb, NULL, 'D', NULL, NULL, 19)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 7, '2-7', 7, 'mcq', 'The following text is from Georgia Douglas Johnson''s 1922 poem “Benediction.”

Go forth, my son,
Winged by my heart''s desire!
Great reaches, yet unknown,
Await
For your possession.
I may not, if I would,
Retrace the way with you,
My pilgrimage is through,
But life is calling you!', NULL, 'Which choice best states the main purpose of the text?', '{"A":"To express hope that a child will have the same accomplishments as his parent did","B":"To suggest that raising a child involves many struggles","C":"To warn a child that he will face many challenges throughout his life","D":"To encourage a child to embrace the experiences life will offer"}'::jsonb, NULL, 'D', NULL, NULL, 20)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 8, '2-8', 8, 'mcq', 'The following text is from Edith Wharton''s 1905 novel The House of Mirth. Lily Bart and a companion are walking through a park.

Lily had no real intimacy with nature, but she had a passion for the appropriate and could be keenly sensitive to a scene which was the fitting background of her own sensations. The landscape outspread below her seemed an enlargement of her present mood, and she found something of herself in its calmness, its breadth, its long free reaches. <u>On the nearer slopes the sugar-maples wavered like pyres of light; lower down was a massing of grey orchards, and here and there the lingering green of an oak-grove.</u>', NULL, 'Which choice best describes the function of the underlined sentence in the text as a whole?', '{"A":"It creates a detailed image of the physical setting of the scene.","B":"It establishes that a character is experiencing an internal conflict.","C":"It makes an assertion that the next sentence then expands on.","D":"It illustrates an idea that is introduced in the previous sentence."}'::jsonb, NULL, 'D', NULL, NULL, 20)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 9, '2-9', 9, 'mcq', '<u>Individual elephants and Arctic herbivores such as caribou tend to have fixed geographic ranges throughout their lifetimes, which had prompted some researchers to speculate that the Arctic woolly mammoth, an extinct elephantid, might have exhibited similar behavior.</u> Mammoth tusks grew in sequential layers, incorporating ingested minerals and organics, and so each ivory stratum reflects the ratio of strontium isotopes (87Sr/86Sr) in the local environment; thus, the sequence of strata shows where the animal roamed during life. Recent analysis of the strontium ratios in the strata of one Arctic woolly mammoth tusk in relation to the geographic distribution of strontium ratios in the environment shows the animal''s range begin to expand as it reached sexual maturity, only to contract again in its final 1.5 years.', NULL, 'Which choice best describes the function of the underlined statement in the text as a whole?', '{"A":"It discusses a characteristic shared by certain animals in order to explain why researchers raised a possibility that turned out not to be supported by data described later in the text.","B":"It illustrates a pattern of behavior among certain animals in order to present a theory about exceptions to that pattern that is weakened by a finding described later in the text.","C":"It describes a similarity in the behavior of certain animals in order to show why a method described later in the text did not reveal whether another animal also showed that behavior.","D":"It introduces a trait shared by certain animals in order to contextualize a hypothesis about the origin of that trait that is advanced later in the text."}'::jsonb, NULL, 'A', NULL, NULL, 21)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 10, '2-10', 10, 'mcq', 'In the 1960s, Gloria Richardson led a movement to promote racial equality. Her involvement in this effort was inspired by her daughter, Donna Richardson. In 1961, Donna joined protests organized by the Student Nonviolent Coordinating Committee in Cambridge, Maryland. Following her daughter, Gloria joined these protests too. Gloria soon became the cochair of the Cambridge Nonviolent Action Committee. She was also the leader of what became known as the Cambridge movement.', NULL, 'According to the text, what did Gloria Richardson lead?', '{"A":"The Cambridge movement","B":"Her daughter Donna''s high school","C":"Protests to support environmental protections","D":"A new business in Cambridge, Maryland"}'::jsonb, NULL, 'A', NULL, NULL, 21)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 11, '2-11', 11, 'mcq', 'The following text is from Jane Austen''s 1811 novel Sense and Sensibility. Elinor lives with her younger sisters and her mother, Mrs. Dashwood.

Elinor, this eldest daughter, whose advice was so effectual, possessed a strength of understanding, and coolness of judgment, which qualified her, though only nineteen, to be the counsellor of her mother, and enabled her frequently to counteract, to the advantage of them all, that eagerness of mind in Mrs. Dashwood which must generally have led to imprudence. She had an excellent heart;—her disposition was affectionate, and her feelings were strong; but she knew how to govern them: it was a knowledge which her mother had yet to learn; and which one of her sisters had resolved never to be taught.', NULL, 'According to the text, what is true about Elinor?', '{"A":"Elinor often argues with her mother but fails to change her mind.","B":"Elinor can be overly sensitive with regard to family matters.","C":"Elinor thinks her mother is a bad role model.","D":"Elinor is remarkably mature for her age."}'::jsonb, NULL, 'D', NULL, NULL, 22)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 12, '2-12', 12, 'mcq', 'Culinary anthropologist Vertamae Smart-Grosvenor may be known for her decades of work in national public television and radio, but her book Vibration Cooking: or, the Travel Notes of a Geechee Girl is likely her most influential project. The 1970 book, whose title refers to Smart-Grosvenor''s roots in the Low Country of South Carolina, was unusual for its time. It combined memoir, recipes, travel writing, and social commentary and challenged notions about conventions of food and cooking. Long admired by many, the book and its author have shaped contemporary approaches to writing about cuisine.', NULL, 'Which choice best describes the main idea of the text?', '{"A":"Smart-Grosvenor''s unconventional book Vibration Cooking: or, the Travel Notes of a Geechee Girl is an important contribution to food writing.","B":"Smart-Grosvenor held many different positions over her life, including reporter and food writer.","C":"Smart-Grosvenor''s groundbreaking book Vibration Cooking: or, the Travel Notes of a Geechee Girl didn''t receive the praise it deserved when it was first published in 1970.","D":"Smart-Grosvenor was a talented chef whose work inspired many people to start cooking for themselves."}'::jsonb, NULL, 'A', NULL, NULL, 22)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 13, '2-13', 13, 'mcq', 'The following text is adapted from Charles W. Chesnutt''s 1901 novel The Marrow of Tradition.

Mrs. Ochiltree was a woman of strong individuality, whose comments upon her acquaintance[s], present or absent, were marked by a frankness at times no less than startling. This characteristic caused her to be more or less avoided. Mrs. Ochiltree was aware of this sentiment on the part of her acquaintance[s], and rather exulted in it.', NULL, 'Based on the text, what is true about Mrs. Ochiltree''s acquaintances?', '{"A":"They try to refrain from discussing topics that would upset Mrs. Ochiltree.","B":"They are unable to spend as much time with Mrs. Ochiltree as she would like.","C":"They are too preoccupied with their own concerns to speak with Mrs. Ochiltree.","D":"They are likely offended by what Mrs. Ochiltree has said about them."}'::jsonb, NULL, 'D', NULL, NULL, 23)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 14, '2-14', 14, 'mcq', '“Mrs. Spring Fragrance” is a 1912 short story by Sui Sin Far. In the story, Mrs. Spring Fragrance, a Chinese immigrant living in Seattle, is traveling in California. In letters to her husband and friend, she demonstrates her concern for what''s happening at her home in Seattle while she is away: ______', NULL, 'Which quotation from Mrs. Spring Fragrance''s letters most effectively illustrates the claim?', '{"A":"“My honorable cousin is preparing for the Fifth Moon Festival, and wishes me to compound for the occasion some American ‘fudge,’ for which delectable sweet, made by my clumsy hands, you have sometimes shown a slight prejudice.”","B":"“Next week I accompany Ah Oi to the beauteous town of San José. There will we be met by the son of the Illustrious Teacher.”","C":"“Forget not to care for the cat, the birds, and the flowers. Do not eat too quickly nor fan too vigorously now that the weather is warming.”","D":"“I am enjoying a most agreeable visit, and American friends, as also our own, strive benevolently for the accomplishment of my pleasure.”"}'::jsonb, NULL, 'C', NULL, NULL, 23)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 15, '2-15', 15, 'mcq', 'When digging for clams, their primary food, sea otters damage the roots of eelgrass plants growing on the seafloor. Near Vancouver Island in Canada, the otter population is large and well established, yet the eelgrass meadows are healthier than those found elsewhere off Canada''s coast. To explain this, conservation scientist Erin Foster and colleagues compared the Vancouver Island meadows to meadows where otters are absent or were reintroduced only recently. Finding that the Vancouver Island meadows have a more diverse gene pool than the others do, Foster hypothesized that damage to eelgrass roots increases the plant''s rate of sexual reproduction; this, in turn, boosts genetic diversity, which benefits the meadows'' health overall.', NULL, 'Which finding, if true, would most directly undermine Foster''s hypothesis?', '{"A":"At some sites in the study, eelgrass meadows are found near otter populations that are small and have only recently been reintroduced.","B":"At several sites not included in the study, there are large, well-established sea otter populations but no eelgrass meadows.","C":"At several sites not included in the study, eelgrass meadows'' health correlates negatively with the length of residence and size of otter populations.","D":"At some sites in the study, the health of plants unrelated to eelgrass correlates negatively with the length of residence and size of otter populations."}'::jsonb, NULL, 'C', NULL, NULL, 24)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 16, '2-16', 16, 'mcq', 'In the twentieth century, ethnographers made a concerted effort to collect Mexican American folklore, but they did not always agree about that folklore''s origins. Scholars such as Aurelio Espinosa claimed that Mexican American folklore derived largely from the folklore of Spain, which ruled Mexico and what is now the southwestern United States from the sixteenth to early nineteenth centuries. Scholars such as Américo Paredes, by contrast, argued that while some Spanish influence is undeniable, Mexican American folklore is mainly the product of the ongoing interactions of various cultures in Mexico and the United States.', NULL, 'Which finding, if true, would most directly support Paredes''s argument?', '{"A":"The folklore that the ethnographers collected included several songs written in the form of a décima, a type of poem originating in late sixteenth-century Spain.","B":"Much of the folklore that the ethnographers collected had similar elements from region to region.","C":"Most of the folklore that the ethnographers collected was previously unknown to scholars.","D":"Most of the folklore that the ethnographers collected consisted of corridos—ballads about history and social life—of a clearly recent origin."}'::jsonb, NULL, 'D', NULL, NULL, 24)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 17, '2-17', 17, 'mcq', 'Among social animals that care for their young, such as chickens, macaque monkeys, and humans, newborns appear to show an innate attraction to faces and face-like stimuli. Elisabetta Versace and her colleagues used an image of three black dots arranged in the shape of eyes and a nose or mouth to test whether this trait also occurs in Testudo tortoises, which live alone and do not engage in parental care. They found that tortoise hatchlings showed a significant preference for the image, suggesting that ______', NULL, 'Which choice most logically completes the text?', '{"A":"face-like stimuli are likely perceived as harmless by newborns of social species that practice parental care but as threatening by newborns of solitary species without parental care.","B":"researchers should not assume that an innate attraction to face-like stimuli is necessarily an adaptation related to social interaction or parental care.","C":"researchers can assume that the attraction to face-like stimuli that is seen in social species that practice parental care is learned rather than innate.","D":"newly hatched Testudo tortoises show a stronger preference for face-like stimuli than adult Testudo tortoises do."}'::jsonb, NULL, 'B', NULL, NULL, 25)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 18, '2-18', 18, 'mcq', 'Aptamers—synthetic DNA or RNA molecules that bind to target molecules—can be used to test for foodborne bacterial pathogens, though their specificity (the probability of returning a negative result in the absence of the focal pathogen) in real-world foods has been unclear. Sandeep Somvanshi et al. fabricated test paper incorporating aptamers targeting strain O157:H7 of the bacteria Escherichia coli; the paper shifts from pink to purple as the aptamers bind to target molecules. Somvanshi et al. tested the paper in store-bought pear juice they treated with E. coli O157:H7, other strains of E. coli, or other bacteria species. Following exposure, the paper from the O157:H7 test was purple while papers from the other tests were pink, suggesting that ______', NULL, 'Which choice most logically completes the text?', '{"A":"aptamer-based tests in real-world foods are more likely to show a high degree of specificity if the focal pathogen is E. coli O157:H7 than if the focal pathogen is another strain of E. coli or another species.","B":"uncertainty about the specificity of aptamer-based tests for pathogens in real-world foods may be due to the similarity between E. coli O157:H7 and other E. coli strains.","C":"the specificity of the tests in a real-world food was unaffected by the aptamers'' tendency to bind to different strains of E. coli.","D":"the aptamers successfully bound to E. coli O157:H7 and the tests displayed a high degree of specificity in a real-world food."}'::jsonb, NULL, 'D', NULL, NULL, 25)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 19, '2-19', 19, 'mcq', 'British scientists James Watson and Francis Crick won the Nobel Prize in part for their 1953 paper announcing the double helix structure of DNA, but it is misleading to say that Watson and Crick discovered the double helix. ______ findings were based on a famous X-ray image of DNA fibers, “Photo 51,” developed by X-ray crystallographer Rosalind Franklin and her graduate student Raymond Gosling.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"They''re","B":"It''s","C":"Their","D":"Its"}'::jsonb, NULL, 'C', NULL, NULL, 26)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 20, '2-20', 20, 'mcq', 'In the historical novel The Surrender Tree, Cuban American author Margarita Engle uses poetry rather than prose ______ the true story of Cuban folk hero Rosa La Bayamesa.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"tells","B":"told","C":"is telling","D":"to tell"}'::jsonb, NULL, 'D', NULL, NULL, 26)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 21, '2-21', 21, 'mcq', 'Interest in mechanotransduction, the mechanism by which cells sense and convert mechanical stimuli into biochemical signals, is expanding because of innovative work by biomedical scientists—many of whom, like neuroscience and biophysics expert Elba Serrano, ______ this mechanism to better understand how the body''s neurological and biomechanical systems interact.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"is studying","B":"has studied","C":"study","D":"studies"}'::jsonb, NULL, 'C', NULL, NULL, 26)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 22, '2-22', 22, 'mcq', 'In crafting her fantasy fiction, Nigerian-born British author Helen Oyeyemi has drawn inspiration from the classic nineteenth-century fairy tales of the Brothers Grimm. Her 2014 novel Boy, Snow, Bird, for instance, is a complex retelling of the story of Snow White, while her 2019 novel ______ offers a delicious twist on the classic tale of Hansel and Gretel.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"Gingerbread—","B":"Gingerbread,","C":"Gingerbread","D":"Gingerbread:"}'::jsonb, NULL, 'C', NULL, NULL, 26)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 23, '2-23', 23, 'mcq', 'Sociologist Todd Gitlin co-opted the term “recombinant,” normally used in reference to genetic engineering, to describe serialized television shows of the 1980s. Gitlin''s use of the term referenced TV studios'' practice of repackaging successful narrative formulas as new ______ even shows that varied only slightly from other shows still attracted sizeable audiences.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"content, in that era","B":"content; in that era,","C":"content in that era,","D":"content, in that era,"}'::jsonb, NULL, 'B', NULL, NULL, 27)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 24, '2-24', 24, 'mcq', 'When external forces are applied to common glass made from silicates, energy builds up around minuscule defects in the material, resulting in fractures. Recently, engineer Erkka Frankberg of Tampere University in Finland used the chemical ______ to make a glassy solid that can withstand higher strain than silicate glass can before fracturing.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"compound, aluminum oxide","B":"compound aluminum oxide,","C":"compound, aluminum oxide,","D":"compound aluminum oxide"}'::jsonb, NULL, 'D', NULL, NULL, 27)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 25, '2-25', 25, 'mcq', 'In the late nineteenth and early twentieth centuries, automobiles were commonly referred to as horseless carriages after the older technology they still resembled. Known as the Brass Era, this period in automotive design is remembered for its grandeur and artistry, its vehicles ______ by collectors for their ornate detailing and gleaming brass fittings.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"are highly prized","B":"had been highly prized","C":"highly prized","D":"were highly prized"}'::jsonb, NULL, 'C', NULL, NULL, 27)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 26, '2-26', 26, 'mcq', 'With the development of new technologies that use natural resources more efficiently, the overall consumption of those resources might be expected to decrease. Economists have observed that improvements in efficiency often correlate negatively with resource ______ efficiency gains, lowering the cost of use, may increase demand to the extent that resource consumption ultimately rises.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"conservation, though,","B":"conservation; though","C":"conservation, though;","D":"conservation, though"}'::jsonb, NULL, 'C', NULL, NULL, 27)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 27, '2-27', 27, 'mcq', 'Before California''s 1911 election to approve a proposition granting women the right to vote, activists across the state sold tea to promote the cause of suffrage. In San Francisco, the Woman''s Suffrage Party sold Equality Tea at local fairs. ______ in Los Angeles, activist Nancy Tuttle Craig, who ran one of California''s largest grocery store firms, distributed Votes for Women Tea.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"For example,","B":"To conclude,","C":"Similarly,","D":"In other words,"}'::jsonb, NULL, 'C', NULL, NULL, 28)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 28, '2-28', 28, 'mcq', 'Earth''s auroras—colorful displays of light seen above the northern and southern poles—result, broadly speaking, from the Sun''s activity. ______ the Sun releases charged particles that are captured by Earth''s magnetic field and channeled toward the poles. These particles then collide with atoms in the atmosphere, causing the atoms to emit auroral light.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"Specifically,","B":"Similarly,","C":"Nevertheless,","D":"Hence,"}'::jsonb, NULL, 'A', NULL, NULL, 28)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 29, '2-29', 29, 'mcq', 'While researching a topic, a student has taken the following notes:
• The Seikan Tunnel is a rail tunnel in Japan.
• It connects the island of Honshu to the island of Hokkaido.
• It is roughly 33 miles long.
• The Channel Tunnel is a rail tunnel in Europe.
• It connects Folkestone, England, to Coquelles, France.
• It is about 31 miles long.', NULL, 'The student wants to compare the lengths of the two rail tunnels. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"Some of the world''s rail tunnels, including one tunnel that extends from Folkestone, England, to Coquelles, France, are longer than 30 miles.","B":"The Seikan Tunnel is roughly 33 miles long, while the slightly shorter Channel Tunnel is about 31 miles long.","C":"The Seikan Tunnel, which is roughly 33 miles long, connects the Japanese islands of Honshu and Hokkaido.","D":"Both the Seikan Tunnel, which is located in Japan, and the Channel Tunnel, which is located in Europe, are examples of rail tunnels."}'::jsonb, NULL, 'B', NULL, NULL, 28)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 30, '2-30', 30, 'mcq', 'While researching a topic, a student has taken the following notes:
• Pinnipeds, which include seals, sea lions, and walruses, live in and around water.
• Pinnipeds are descended not from sea animals but from four-legged, land-dwelling carnivores.
• Canadian paleobiologist Natalia Rybczynski recently found a fossil with four legs, webbed toes, and the skull and teeth of a seal.
• Rybczynski refers to her rare find as a “transitional fossil.”
• The fossil illustrates an early stage in the evolution of pinnipeds from their land-dwelling ancestors.', NULL, 'The student wants to emphasize the fossil''s significance. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"Canadian paleobiologist Natalia Rybczynski''s fossil has the skull and teeth of a seal, which, like sea lions and walruses, is a pinniped.","B":"Pinnipeds are descended from four-legged, land-dwelling carnivores; a fossil that resembles both was recently found.","C":"Having four legs but the skull and teeth of a seal, the rare fossil illustrates an early stage in the evolution of pinnipeds from their land-dwelling ancestors.","D":"A “transitional fossil” was recently found by paleobiologist Natalia Rybczynski."}'::jsonb, NULL, 'C', NULL, NULL, 29)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 31, '2-31', 31, 'mcq', 'While researching a topic, a student has taken the following notes:
• Physicist Muluneh Abebe was working on a garment suited for both warm and cold conditions.
• He analyzed the emissivity, or ability to emit heat, of the materials he planned to use.
• Abebe found that reflective metal fibers emitted almost no heat and had an emissivity of 0.02.
• He found that silicon carbide fibers absorbed large amounts of heat and had an emissivity of 0.74.
• The amount of heat a material absorbs is equal to the amount of heat it emits.', NULL, 'The student wants to contrast the emissivity of reflective metal fibers with that of silicon carbide fibers. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"The ability of reflective metal fibers and silicon carbide fibers to emit heat was determined by an analysis of each material''s emissivity.","B":"The amount of heat a material absorbs is equal to the amount it emits, as evidenced in Abebe''s analyses.","C":"Though the reflective metal fibers and silicon carbide fibers had different rates of emissivity, Abebe planned to use both in a garment.","D":"Whereas the reflective metal fibers had an emissivity of just 0.02, the silicon carbide fibers absorbed large amounts of heat, resulting in an emissivity of 0.74."}'::jsonb, NULL, 'D', NULL, NULL, 29)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 32, '2-32', 32, 'mcq', 'While researching a topic, a student has taken the following notes:
• In 2020, theater students at Radford and Virginia Tech chose an interactive, online format to present a play about woman suffrage activists.
• Their “Women and the Vote” website featured an interactive digital drawing of a Victorian-style house.
• Audiences were asked to focus on a room of their choice and select from that room an artifact related to the suffrage movement.
• One click took them to video clips, songs, artwork, and texts associated with the artifact.
• The play was popular with audiences because the format allowed them to control the experience.', NULL, 'The student wants to explain an advantage of the “Women and the Vote” format. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"“Women and the Vote” featured a drawing of a Victorian-style house with several rooms, each containing suffrage artifacts.","B":"To access video clips, songs, artwork, and texts, audiences had to first click on an artifact.","C":"The “Women and the Vote” format appealed to audiences because it allowed them to control the experience.","D":"Using an interactive format, theater students at Radford and Virginia Tech created “Women and the Vote,” a play about woman suffrage activists."}'::jsonb, NULL, 'C', NULL, NULL, 30)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 33, '2-33', 33, 'mcq', 'While researching a topic, a student has taken the following notes:
• Ducklings expend up to 62.8% less energy when swimming in a line behind their mother than when swimming alone.
• The physics behind this energy savings hasn''t always been well understood.
• Naval architect Zhiming Yuan used computer simulations to study the effect of the mother duck''s wake.
• The study revealed that ducklings are pushed in a forward direction by the wake''s waves.
• Yuan determined this push reduces the effect of wave drag on the ducklings by 158%.', NULL, 'The student wants to present the study and its methodology. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"A study revealed that ducklings, which expend up to 62.8% less energy when swimming in a line behind their mother, also experience 158% less drag.","B":"Seeking to understand how ducklings swimming in a line behind their mother save energy, Zhiming Yuan used computer simulations to study the effect of the mother duck''s wake.","C":"Zhiming Yuan studied the physics behind the fact that by being pushed in a forward direction by waves, ducklings save energy.","D":"Naval architect Zhiming Yuan discovered that ducklings are pushed in a forward direction by the waves of their mother''s wake, reducing the effect of drag by 158%."}'::jsonb, NULL, 'B', NULL, NULL, 30)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;

  INSERT INTO public.test_modules (test_id, position, section, label, time_limit_seconds, question_count)
  VALUES (v_test, 3, 'math', 'Math — Module 1', 2100, 27)
  ON CONFLICT (test_id, position) DO UPDATE SET section=EXCLUDED.section, label=EXCLUDED.label,
    time_limit_seconds=EXCLUDED.time_limit_seconds, question_count=EXCLUDED.question_count
  RETURNING id INTO v_mod;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 1, '3-1', 1, 'mcq', NULL, NULL, 'The lengths of two sides of a triangle are 4 centimeters and 6 centimeters. If the perimeter of the triangle is 18 centimeters, what is the length, in centimeters, of the third side of this triangle?', '{"A":"2","B":"8","C":"10","D":"24"}'::jsonb, NULL, 'B', NULL, NULL, 32)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 2, '3-2', 2, 'mcq', '$16x + 30 = 190$', NULL, 'Which equation has the same solution as the given equation?', '{"A":"$16x = 30$","B":"$16x = 130$","C":"$16x = 160$","D":"$16x = 190$"}'::jsonb, NULL, 'C', NULL, NULL, 32)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 3, '3-3', 3, 'mcq', NULL, NULL, 'Ty set a goal to walk at least 24 kilometers every day to prepare for a multiday hike. On a certain day, Ty plans to walk at an average speed of 4 kilometers per hour. What is the minimum number of hours Ty must walk on that day to fulfill the daily goal?', '{"A":"4","B":"6","C":"20","D":"24"}'::jsonb, NULL, 'B', NULL, NULL, 32)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 4, '3-4', 4, 'mcq', NULL, NULL, 'The function $g$ is defined by $g(x) = x^2 + 9$. For which value of $x$ is $g(x) = 25$ ?', '{"A":"4","B":"5","C":"9","D":"13"}'::jsonb, NULL, 'A', NULL, NULL, 32)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 5, '3-5', 5, 'mcq', NULL, NULL, 'Which expression is equivalent to $9x^2 + 5x$ ?', '{"A":"$x(9x + 5)$","B":"$5x(9x + 1)$","C":"$9x(x + 5)$","D":"$x^2(9x + 5)$"}'::jsonb, NULL, 'A', NULL, NULL, 32)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 6, '3-6', 6, 'grid', 'Each value in the data set shown represents the height, in centimeters, of a plant.

6, 10, 13, 2, 15, 22, 10, 4, 4, 4', NULL, 'What is the mean height, in centimeters, of these plants?', NULL, NULL, '9', '["9"]'::jsonb, NULL, 32)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 7, '3-7', 7, 'grid', NULL, NULL, 'A student council group is selling school posters for a fundraiser. They use the function $p(x) = 5x - 220$ to determine their profit $p(x)$, in dollars, for selling $x$ school posters. In order to earn a profit of $900, how many school posters must they sell?', NULL, NULL, '224', '["224"]'::jsonb, NULL, 33)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 8, '3-8', 8, 'mcq', NULL, NULL, 'Jay walks at a speed of 3 miles per hour and runs at a speed of 5 miles per hour. He walks for $w$ hours and runs for $r$ hours for a combined total of 14 miles. Which equation represents this situation?', '{"A":"$3w + 5r = 14$","B":"$\\frac{1}{3}w + \\frac{1}{5}r = 14$","C":"$\\frac{1}{3}w + \\frac{1}{5}r = 112$","D":"$3w + 5r = 112$"}'::jsonb, NULL, 'A', NULL, NULL, 33)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 9, '3-9', 9, 'mcq', NULL, NULL, 'John paid a total of $165 for a microscope by making a down payment of $37 plus $p$ monthly payments of $16 each. Which of the following equations represents this situation?', '{"A":"$16p - 37 = 165$","B":"$37p - 16 = 165$","C":"$16p + 37 = 165$","D":"$37p + 16 = 165$"}'::jsonb, NULL, 'C', NULL, NULL, 33)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 10, '3-10', 10, 'mcq', '$y - 57 = px$', NULL, 'The given equation relates the positive numbers $p$, $x$, and $y$. Which equation correctly expresses $y$ in terms of $p$ and $x$ ?', '{"A":"$y = 57x + p$","B":"$y = px + 57$","C":"$y = 57px$","D":"$y = \\frac{px}{57}$"}'::jsonb, NULL, 'B', NULL, NULL, 33)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 11, '3-11', 11, 'mcq', NULL, NULL, 'A company opens an account with an initial balance of $36,100.00. The account earns interest, and no additional deposits or withdrawals are made. The account balance is given by an exponential function $A$, where $A(t)$ is the account balance, in dollars, $t$ years after the account is opened. The account balance after 13 years is $48,072.93. Which equation defines $A$ ?', '{"A":"$A(t) = 36,100.00(1.05)^t$","B":"$A(t) = 36,100.00(1.93)^t$","C":"$A(t) = 31,971.93(1.05)^t$","D":"$A(t) = 36,100.00(0.05)^t$"}'::jsonb, NULL, 'A', NULL, NULL, 34)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 12, '3-12', 12, 'mcq', NULL, 'A circle with center O. Two diameters PR and QS intersect at O, dividing the circle into four arcs. Points P, Q, R, S are on the circle (P top-left, R bottom-right area; Q and S as the other diameter endpoints). Note: Figure not drawn to scale.', 'The circle shown has center $O$, circumference $144\pi$, and diameters $\overline{PR}$ and $\overline{QS}$. The length of arc $PS$ is twice the length of arc $PQ$. What is the length of arc $QR$ ?', '{"A":"$24\\pi$","B":"$48\\pi$","C":"$72\\pi$","D":"$96\\pi$"}'::jsonb, '/data/tests/cb-og-9/figures/m3-q12.png', 'B', NULL, NULL, 34)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 13, '3-13', 13, 'grid', '$y = 2x$
$3x + y = 40$', NULL, 'The solution to the given system of equations is $(x, y)$. What is the value of $x$ ?', NULL, NULL, '40', '["40"]'::jsonb, NULL, 34)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 14, '3-14', 14, 'grid', 'The frequency table summarizes the 57 data values in a data set.

Data value | Frequency
6 | 5
7 | 5
8 | 8
9 | 8
10 | 9
11 | 11
12 | 9
13 | 0
14 | 6', NULL, 'What is the maximum data value in the data set?', NULL, NULL, '14', '["14"]'::jsonb, NULL, 34)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 15, '3-15', 15, 'mcq', NULL, NULL, 'One leg of a right triangle has a length of 43.2 millimeters. The hypotenuse of the triangle has a length of 196.8 millimeters. What is the length of the other leg of the triangle, in millimeters?', '{"A":"43.2","B":"120","C":"192","D":"201.3"}'::jsonb, NULL, 'C', NULL, NULL, 34)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 16, '3-16', 16, 'mcq', NULL, NULL, 'A wire with a length of 106 inches is cut into two parts. One part has a length of $x$ inches, and the other part has a length of $y$ inches. The value of $x$ is 6 more than 4 times the value of $y$. What is the value of $x$ ?', '{"A":"25","B":"28","C":"56","D":"86"}'::jsonb, NULL, 'D', NULL, NULL, 35)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 17, '3-17', 17, 'mcq', '$f(x) = (x + 6)(x + 5)(x - 4)$', NULL, 'The function $f$ is given. Which table of values represents $y = f(x) - 3$ ?', '{"A":"$x$: −6, −5, 4; $y$: −9, −8, 1","B":"$x$: −6, −5, 4; $y$: −3, −3, −3","C":"$x$: −6, −5, 4; $y$: −3, −2, 7","D":"$x$: −6, −5, 4; $y$: 3, 3, 3"}'::jsonb, NULL, 'B', NULL, NULL, 35)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 18, '3-18', 18, 'mcq', NULL, NULL, 'A landscaper uses a hose that puts $88x$ ounces of water in a bucket in $5y$ minutes. Which expression represents the number of ounces of water the hose puts in the bucket in $9y$ minutes at this rate?', '{"A":"$\\frac{9x}{440}$","B":"$\\frac{440x}{9}$","C":"$\\frac{5x}{792}$","D":"$\\frac{792x}{5}$"}'::jsonb, NULL, 'D', NULL, NULL, 35)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 19, '3-19', 19, 'mcq', '$4x - 9y = 9y + 5$
$hy = 2 + 4x$', NULL, 'In the given system of equations, $h$ is a constant. If the system has no solution, what is the value of $h$ ?', '{"A":"−9","B":"0","C":"9","D":"18"}'::jsonb, NULL, 'D', NULL, NULL, 35)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 20, '3-20', 20, 'grid', NULL, NULL, '13 is $p\%$ of 25. What is the value of $p$ ?', NULL, NULL, '52', '["52"]'::jsonb, NULL, 35)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 21, '3-21', 21, 'grid', '$\sqrt{(x - 2)^2} = \sqrt{3x + 34}$', NULL, 'What is the smallest solution to the given equation?', NULL, NULL, '-3', '["-3"]'::jsonb, NULL, 36)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 22, '3-22', 22, 'mcq', NULL, NULL, 'Function $f$ is defined by $f(x) = (x + 6)(x + 5)(x + 1)$. Function $g$ is defined by $g(x) = f(x - 1)$. The graph of $y = g(x)$ in the $xy$-plane has $x$-intercepts at $(a, 0)$, $(b, 0)$, and $(c, 0)$, where $a$, $b$, and $c$ are distinct constants. What is the value of $a + b + c$ ?', '{"A":"−15","B":"−9","C":"11","D":"15"}'::jsonb, NULL, 'B', NULL, NULL, 36)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 23, '3-23', 23, 'mcq', 'For $x > 0$, the function $f$ is defined as follows:

$f(x)$ equals 201% of $x$', NULL, 'Which of the following could describe this function?', '{"A":"Decreasing exponential","B":"Decreasing linear","C":"Increasing exponential","D":"Increasing linear"}'::jsonb, NULL, 'D', NULL, NULL, 36)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 24, '3-24', 24, 'mcq', '$f(x) = 4x^2 + 64x + 262$', NULL, 'The function $g$ is defined by $g(x) = f(x + 5)$. For what value of $x$ does $g(x)$ reach its minimum?', '{"A":"−13","B":"−8","C":"−5","D":"−3"}'::jsonb, NULL, 'A', NULL, NULL, 36)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 25, '3-25', 25, 'mcq', NULL, NULL, 'One gallon of stain will cover 170 square feet of a surface. A yard has a total fence area of $w$ square feet. Which equation represents the total amount of stain $S$, in gallons, needed to stain the fence in this yard twice?', '{"A":"$S = \\frac{w}{170}$","B":"$S = 170w$","C":"$S = 340w$","D":"$S = \\frac{w}{85}$"}'::jsonb, NULL, 'D', NULL, NULL, 36)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 26, '3-26', 26, 'mcq', 'Poll Results
Angel Cruz | 483
Terry Smith | 320

The table shows the results of a poll. A total of 803 voters selected at random were asked which candidate they would vote for in the upcoming election.', NULL, 'According to the poll, if 6,424 people vote in the election, by how many votes would Angel Cruz be expected to win?', '{"A":"163","B":"1,304","C":"3,864","D":"5,621"}'::jsonb, NULL, 'B', NULL, NULL, 37)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 27, '3-27', 27, 'grid', NULL, NULL, 'Right rectangular prism X is similar to right rectangular prism Y. The surface area of right rectangular prism X is 58 square centimeters ($\text{cm}^2$), and the surface area of right rectangular prism Y is $1,450\ \text{cm}^2$. The volume of right rectangular prism Y is 1,250 cubic centimeters ($\text{cm}^3$). What is the sum of the volumes, in $\text{cm}^3$, of right rectangular prism X and right rectangular prism Y?', NULL, NULL, '1260', '["1260"]'::jsonb, NULL, 37)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;

  INSERT INTO public.test_modules (test_id, position, section, label, time_limit_seconds, question_count)
  VALUES (v_test, 4, 'math', 'Math — Module 2', 2100, 27)
  ON CONFLICT (test_id, position) DO UPDATE SET section=EXCLUDED.section, label=EXCLUDED.label,
    time_limit_seconds=EXCLUDED.time_limit_seconds, question_count=EXCLUDED.question_count
  RETURNING id INTO v_mod;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 1, '4-1', 1, 'mcq', NULL, NULL, '$w + 7 = 357$

What value of $w$ is the solution to the given equation?', '{"A":"51","B":"350","C":"364","D":"3,577"}'::jsonb, NULL, 'B', NULL, NULL, 40)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 2, '4-2', 2, 'mcq', NULL, NULL, 'Which expression is equivalent to $16(x + 15)$ ?', '{"A":"$16x + 31$","B":"$16x + 240$","C":"$16x + 1$","D":"$16x + 15$"}'::jsonb, NULL, 'B', NULL, NULL, 40)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 3, '4-3', 3, 'mcq', 'The table summarizes members of a local organization by age and whether they live east or west of the river. Less than 40 years old: live east of the river 17, live west of the river 11, total 28. At least 40 years old: live east of the river 18, live west of the river 89, total 107. Total: live east of the river 35, live west of the river 100, total 135.', NULL, 'The table summarizes members of a local organization by age and whether they live east or west of the river. If a member of the organization is selected at random, what is the probability that the selected member is at least 40 years old?', '{"A":"$\\frac{28}{135}$","B":"$\\frac{35}{135}$","C":"$\\frac{100}{135}$","D":"$\\frac{107}{135}$"}'::jsonb, NULL, 'D', NULL, NULL, 40)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 4, '4-4', 4, 'mcq', NULL, NULL, '$3x = 12$
$-3x + y = -6$

The solution to the given system of equations is $(x, y)$. What is the value of $y$ ?', '{"A":"$-3$","B":"6","C":"18","D":"30"}'::jsonb, NULL, 'B', NULL, NULL, 40)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 5, '4-5', 5, 'mcq', NULL, NULL, 'A line in the $xy$-plane has a slope of $\frac{1}{9}$ and passes through the point $(0, 14)$. Which equation represents this line?', '{"A":"$y = -\\frac{1}{9}x - 14$","B":"$y = -\\frac{1}{9}x + 14$","C":"$y = \\frac{1}{9}x - 14$","D":"$y = \\frac{1}{9}x + 14$"}'::jsonb, NULL, 'D', NULL, NULL, 41)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 6, '4-6', 6, 'grid', NULL, 'A transversal line $c$ crosses two parallel horizontal lines, the upper line labeled $s$ and the lower line labeled $t$. At the intersection of $c$ with line $s$, the angle on the upper-left side is labeled $x°$. At the intersection of $c$ with line $t$, an angle of $110°$ is marked. Figure not drawn to scale.', 'In the figure shown, line $c$ intersects parallel lines $s$ and $t$. What is the value of $x$ ?

Note: Figure not drawn to scale.', NULL, '/data/tests/cb-og-9/figures/m4-q6.png', '70', '["70"]'::jsonb, NULL, 41)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 7, '4-7', 7, 'grid', NULL, NULL, '$f(x) = x + \frac{8}{11}$

The function $f$ is defined by the given equation. What is the value of $f(x)$ when $x = \frac{3}{11}$ ?', NULL, NULL, '1', '["1"]'::jsonb, NULL, 41)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 8, '4-8', 8, 'mcq', 'The table shows three values of x and their corresponding values of y: when x = 0, y = 18; when x = 1, y = 13; when x = 2, y = 8.', NULL, 'The table shows three values of $x$ and their corresponding values of $y$. There is a linear relationship between $x$ and $y$. Which of the following equations represents this relationship?', '{"A":"$y = 18x + 13$","B":"$y = 18x + 18$","C":"$y = -5x + 13$","D":"$y = -5x + 18$"}'::jsonb, NULL, 'D', NULL, NULL, 41)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 9, '4-9', 9, 'mcq', NULL, NULL, '$x + 7 = 10$
$(x + 7)^2 = y$

Which ordered pair $(x, y)$ is a solution to the given system of equations?', '{"A":"$(3, 100)$","B":"$(3, 3)$","C":"$(3, 10)$","D":"$(3, 70)$"}'::jsonb, NULL, 'A', NULL, NULL, 42)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 10, '4-10', 10, 'mcq', NULL, NULL, 'The function $f$ is defined by $f(x) = 7x - 84$. What is the $x$-intercept of the graph of $y = f(x)$ in the $xy$-plane?', '{"A":"$(-12, 0)$","B":"$(-7, 0)$","C":"$(7, 0)$","D":"$(12, 0)$"}'::jsonb, NULL, 'D', NULL, NULL, 42)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 11, '4-11', 11, 'mcq', 'Rosa opened a savings account at a bank. The table shows the exponential relationship between the time t, in years, since Rosa opened the account and the total amount n, in dollars, in the account: at 0 years, 604.00 dollars; at 1 year, 606.42 dollars; at 2 years, 608.84 dollars.', NULL, 'Rosa opened a savings account at a bank. The table shows the exponential relationship between the time $t$, in years, since Rosa opened the account and the total amount $n$, in dollars, in the account. If Rosa made no additional deposits or withdrawals, which of the following equations best represents the relationship between $t$ and $n$ ?', '{"A":"$n = (1 + 604)^t$","B":"$n = (1 + 0.004)^t$","C":"$n = 604(1 + 0.004)^t$","D":"$n = 0.004(1 + 604)^t$"}'::jsonb, NULL, 'C', NULL, NULL, 42)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 12, '4-12', 12, 'mcq', NULL, NULL, '$w(t) = 300 - 4t$

The function $w$ models the volume of liquid, in milliliters, in a container $t$ seconds after it begins draining from a hole at the bottom. According to the model, what is the predicted volume, in milliliters, draining from the container each second?', '{"A":"300","B":"296","C":"75","D":"4"}'::jsonb, NULL, 'D', NULL, NULL, 42)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 13, '4-13', 13, 'grid', NULL, NULL, '$h(x) = x + b$

For the linear function $h$, $b$ is a constant and $h(0) = 45$. What is the value of $b$ ?', NULL, NULL, '45', '["45"]'::jsonb, NULL, 43)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 14, '4-14', 14, 'grid', NULL, NULL, '$z^2 + 10z - 24 = 0$

What is one of the solutions to the given equation?', NULL, NULL, '2', '["2","-12"]'::jsonb, NULL, 43)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 15, '4-15', 15, 'mcq', NULL, NULL, 'Triangle $FGH$ is similar to triangle $JKL$, where angle $F$ corresponds to angle $J$ and angles $G$ and $K$ are right angles. If $\sin(F) = \frac{308}{317}$, what is the value of $\sin(J)$ ?', '{"A":"$\\frac{75}{317}$","B":"$\\frac{308}{317}$","C":"$\\frac{317}{308}$","D":"$\\frac{317}{75}$"}'::jsonb, NULL, 'B', NULL, NULL, 43)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 16, '4-16', 16, 'mcq', NULL, NULL, 'The population of Greenville increased by 7% from 2015 to 2016. If the 2016 population is $k$ times the 2015 population, what is the value of $k$ ?', '{"A":"0.07","B":"0.7","C":"1.07","D":"1.7"}'::jsonb, NULL, 'C', NULL, NULL, 43)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 17, '4-17', 17, 'mcq', 'Two dot plots represent the number of glue sticks brought in by each student for two classes. Class A: values range across 1 to 7 on its number line. Class B: values range across 14 to 20 on its number line.', 'Two dot plots side by side, each plotting number of glue sticks. Class A is plotted over a number line marked 1 2 3 4 5 6 7, with dots clustered in the middle of that range. Class B is plotted over a number line marked 14 15 16 17 18 19 20, with dots clustered in the middle of that range. Both distributions have a similar shape/spread about their respective centers.', 'Each of the dot plots shown represents the number of glue sticks brought in by each student for two classes, class A and class B. Which statement best compares the standard deviations of the numbers of glue sticks brought in by each student for these two classes?', '{"A":"The standard deviation of the number of glue sticks brought in by each student for class A is less than the standard deviation of the number of glue sticks brought in by each student for class B.","B":"The standard deviation of the number of glue sticks brought in by each student for class A is equal to the standard deviation of the number of glue sticks brought in by each student for class B.","C":"The standard deviation of the number of glue sticks brought in by each student for class A is greater than the standard deviation of the number of glue sticks brought in by each student for class B.","D":"There is not enough information to compare these standard deviations."}'::jsonb, '/data/tests/cb-og-9/figures/m4-q17.png', 'B', NULL, NULL, 43)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 18, '4-18', 18, 'mcq', NULL, NULL, '$m(t) = -0.0274\left(\frac{t}{7}\right)^2 + 7.3873\left(\frac{t}{7}\right) + 75.032$

The function $m$ gives the predicted body mass $m(t)$, in kilograms (kg), of a certain animal $t$ days after it was born in a wildlife reserve, where $t \le 390$. Which of the following is the best interpretation of the statement “$m(330)$ is approximately equal to 362” in this context?', '{"A":"The predicted body mass of the animal was approximately 330 kg 362 days after it was born.","B":"The predicted body mass of the animal was approximately 362 kg 330 days after it was born.","C":"The predicted body mass of the animal was approximately 362 kg $\\frac{330}{7}$ days after it was born.","D":"The predicted body mass of the animal was approximately $\\frac{330}{7}$ kg 362 days after it was born."}'::jsonb, NULL, 'B', NULL, NULL, 44)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 19, '4-19', 19, 'mcq', NULL, NULL, 'Triangle $XYZ$ is similar to triangle $RST$ such that $X$, $Y$, and $Z$ correspond to $R$, $S$, and $T$, respectively. The measure of $\angle Z$ is $20°$ and $2XY = RS$. What is the measure of $\angle T$ ?', '{"A":"$2°$","B":"$10°$","C":"$20°$","D":"$40°$"}'::jsonb, NULL, 'C', NULL, NULL, 44)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 20, '4-20', 20, 'grid', NULL, NULL, 'The function $f(t) = 60{,}000(2)^{\frac{t}{410}}$ gives the number of bacteria in a population $t$ minutes after an initial observation. How much time, in minutes, does it take for the number of bacteria in the population to double?', NULL, NULL, '410', '["410"]'::jsonb, NULL, 44)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 21, '4-21', 21, 'grid', NULL, NULL, 'The function $f$ is defined by $f(x) = a^x + b$, where $a$ and $b$ are constants and $a > 0$. In the $xy$-plane, the graph of $y = f(x)$ has a $y$-intercept at $(0, -25)$ and passes through the point $(2, 23)$. What is the value of $a + b$ ?', NULL, NULL, '-19', '["-19"]'::jsonb, NULL, 44)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 22, '4-22', 22, 'mcq', NULL, NULL, '$y > 13x - 18$

For which of the following tables are all the values of $x$ and their corresponding values of $y$ solutions to the given inequality?', '{"A":"Table A: $(x, y)$ pairs $(3, 21)$, $(5, 47)$, $(8, 86)$.","B":"Table B: $(x, y)$ pairs $(3, 26)$, $(5, 42)$, $(8, 86)$.","C":"Table C: $(x, y)$ pairs $(3, 16)$, $(5, 42)$, $(8, 81)$.","D":"Table D: $(x, y)$ pairs $(3, 26)$, $(5, 52)$, $(8, 91)$."}'::jsonb, NULL, 'D', NULL, NULL, 45)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 23, '4-23', 23, 'mcq', NULL, NULL, 'A certain town has an area of 4.36 square miles. What is the area, in square yards, of this town? (1 mile = 1,760 yards)', '{"A":"404","B":"7,674","C":"710,459","D":"13,505,536"}'::jsonb, NULL, 'D', NULL, NULL, 45)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 24, '4-24', 24, 'mcq', NULL, NULL, 'A square is inscribed in a circle. The radius of the circle is $\frac{20\sqrt{2}}{2}$ inches. What is the side length, in inches, of the square?', '{"A":"20","B":"$\\frac{20\\sqrt{2}}{2}$","C":"$20\\sqrt{2}$","D":"40"}'::jsonb, NULL, 'A', NULL, NULL, 45)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 25, '4-25', 25, 'mcq', NULL, NULL, 'Which expression is equivalent to $\frac{y + 12}{x - 8} + \frac{y(x - 8)}{x^2 y - 8xy}$ ?', '{"A":"$\\frac{xy + y + 4}{x^3 y - 16x^2 y + 64xy}$","B":"$\\frac{xy + 9y + 12}{x^2 y - 8xy + x - 8}$","C":"$\\frac{xy^2 + 13xy - 8y}{x^2 y - 8xy}$","D":"$\\frac{xy^2 + 13xy - 8y}{x^3 y - 16x^2 y + 64xy}$"}'::jsonb, NULL, 'C', NULL, NULL, 45)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 26, '4-26', 26, 'mcq', NULL, NULL, 'The function $f$ is defined by $f(x) = a(2.2^x + 2.2^b)$, where $a$ and $b$ are integer constants and $0 < a < b$. The functions $g$ and $h$ are equivalent to function $f$, where $k$ and $m$ are constants. Which of the following equations displays the $y$-coordinate of the $y$-intercept of the graph of $y = f(x)$ in the $xy$-plane as a constant or coefficient?

I. $g(x) = a(2.2^x + k)$
II. $h(x) = a(2.2)^x + m$', '{"A":"I only","B":"II only","C":"I and II","D":"Neither I nor II"}'::jsonb, NULL, 'D', NULL, NULL, 46)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 27, '4-27', 27, 'grid', NULL, NULL, '$x(kx - 56) = -16$

In the given equation, $k$ is an integer constant. If the equation has no real solution, what is the least possible value of $k$ ?', NULL, NULL, '50', '["50"]'::jsonb, NULL, 46)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
END $seed$;
