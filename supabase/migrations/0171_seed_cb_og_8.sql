-- =============================================================================
-- Migration: 0171_seed_cb_og_8.sql
-- Purpose:   Seed "CB OG #8" (College Board linear Digital SAT practice test,
--            66 RW + 54 Math = 120 Q) into the full-test tables from 0048.
--   Source:  sat-practice-test-8-digital.pdf; official College Board answer key (pdf/Key/).
--   Idempotent upsert on (slug)/(test_id,position)/(module_id,position).
-- =============================================================================
DO $seed$
DECLARE v_test uuid; v_mod uuid;
BEGIN
  INSERT INTO public.tests (slug, ordinal, title, short_title, source, total_questions)
  VALUES ('cb-og-8', 14, 'CB OG #8', 'CB OG #8', 'sat-practice-test-8-digital.pdf', 120)
  ON CONFLICT (slug) DO UPDATE SET ordinal=EXCLUDED.ordinal, title=EXCLUDED.title,
    short_title=EXCLUDED.short_title, source=EXCLUDED.source, total_questions=EXCLUDED.total_questions
  RETURNING id INTO v_test;

  INSERT INTO public.test_modules (test_id, position, section, label, time_limit_seconds, question_count)
  VALUES (v_test, 1, 'reading-writing', 'Reading and Writing — Module 1', 1920, 33)
  ON CONFLICT (test_id, position) DO UPDATE SET section=EXCLUDED.section, label=EXCLUDED.label,
    time_limit_seconds=EXCLUDED.time_limit_seconds, question_count=EXCLUDED.question_count
  RETURNING id INTO v_mod;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 1, '1-1', 1, 'mcq', 'As Mexico’s first president from an Indigenous community, Benito Juarez became one of the most ______ figures in his country’s history: among the many significant accomplishments of his long tenure in office (1858–1872), Juarez consolidated the authority of the national government and advanced the rights of Indigenous peoples.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"unpredictable","B":"important","C":"secretive","D":"ordinary"}'::jsonb, NULL, 'B', NULL, NULL, 4)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 2, '1-2', 2, 'mcq', 'Mônica Lopes-Ferreira and others at Brazil’s Butantan Institute are studying the freshwater stingray species <i>Potamotrygon rex</i> to determine whether biological characteristics such as the rays’ age and sex have ______ effect on the toxicity of their venom—that is, to see if differences in these traits are associated with considerable variations in venom potency.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"a disconcerting","B":"an acceptable","C":"an imperceptible","D":"a substantial"}'::jsonb, NULL, 'D', NULL, NULL, 4)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 3, '1-3', 3, 'mcq', 'Kelp forests grow underwater along the eastern Pacific Coast. These underwater forests are important to fish and other marine animals. Ocean currents can be powerful and rough, making it difficult for animals to find safe places to hide from predators. The underwater forests slow down the currents. This creates a more ______ environment with calmer waters where animals can take shelter.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"tranquil","B":"dangerous","C":"imaginative","D":"surprising"}'::jsonb, NULL, 'A', NULL, NULL, 5)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 4, '1-4', 4, 'mcq', '<i>The Mule Bone</i>, a 1930 play written by Zora Neale Hurston and Langston Hughes, is perhaps the best-known of the few examples of ______ in literature. Most writers prefer working alone, and given that working together cost Hurston and Hughes their friendship, it is not hard to see why.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"characterization","B":"interpretation","C":"collaboration","D":"commercialization"}'::jsonb, NULL, 'C', NULL, NULL, 5)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 5, '1-5', 5, 'mcq', 'Ofelia Zepeda’s contributions to the field of linguistics are ______: her many accomplishments include working as a linguistics professor and bilingual poet, authoring the first Tohono O’odham grammar book, and co-founding the American Indian Language Development Institute.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"pragmatic","B":"controversial","C":"extensive","D":"universal"}'::jsonb, NULL, 'C', NULL, NULL, 5)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 6, '1-6', 6, 'mcq', 'Archaeologists studying the ancient city of Pompeii in Italy recently discovered a well-preserved food shop known as a <i>thermopolium</i>. The site contains food remains, artworks, and decorations. These items give researchers a better understanding of what daily life in Pompeii may have been like. For example, the archaeologists found a ceramic jar that they believe likely contained a meat and seafood stew.', NULL, 'Which choice best states the main purpose of the text?', '{"A":"To compare ancient artworks with modern ones","B":"To discuss the political system of Italy","C":"To present a recent archaeological discovery","D":"To describe a region’s climate"}'::jsonb, NULL, 'C', NULL, NULL, 5)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 7, '1-7', 7, 'mcq', 'The following text is from Sarah Orne Jewett’s 1899 short story “Martha’s Lady.” Martha is employed by Miss Pyne as a maid.

Miss Pyne sat by the window watching, in her best dress, looking stately and calm; she seldom went out now, and it was almost time for the carriage. Martha was just coming in from the garden with the strawberries, and with more flowers in her apron. It was a bright cool evening in June, the golden robins sang in the elms, and the sun was going down behind the apple-trees at the foot of the garden. The beautiful old house stood wide open to the long-expected guest.', NULL, 'Which choice best states the main purpose of the text?', '{"A":"To convey the worries brought about by a new guest","B":"To describe how the characters have changed over time","C":"To contrast the activity indoors with the stillness outside","D":"To depict the setting as the characters await a visitor’s arrival"}'::jsonb, NULL, 'D', NULL, NULL, 6)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 8, '1-8', 8, 'mcq', 'The following text is adapted from Aphra Behn’s 1689 novel <i>The Lucky Mistake</i>. Atlante and Rinaldo are neighbors who have been secretly exchanging letters through Charlot, Atlante’s sister.

[Atlante] gave this letter to Charlot; who immediately ran into the balcony with it, where she still found Rinaldo in a melancholy posture, leaning his head on his hand: She showed him the letter, but was afraid to toss it to him, for fear it might fall to the ground; so he ran and fetched a long cane, which he cleft at one end, and held it while she put the letter into the cleft, and stayed not to hear what he said to it. But never was man so transported with joy, as he was at the reading of this letter; it gives him new wounds; for to the generous, nothing obliges love so much as love.', NULL, 'Which choice best describes the overall structure of the text?', '{"A":"It describes the delivery of a letter, and then portrays a character’s happiness at reading that letter.","B":"It establishes that a character is desperate to receive a letter, and then explains why another character has not yet written that letter.","C":"It presents a character’s concerns about delivering a letter, and then details the contents of that letter.","D":"It reveals the inspiration behind a character’s letter, and then emphasizes the excitement that another character feels upon receiving that letter."}'::jsonb, NULL, 'A', NULL, NULL, 6)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 9, '1-9', 9, 'mcq', 'According to historian Vicki L. Ruiz, Mexican American women made crucial contributions to the labor movement during World War II. At the time, food processing companies entered into contracts to supply United States armed forces with canned goods. Increased production quotas conferred greater bargaining power on the companies’ employees, many of whom were Mexican American women: <u>employees insisted on more favorable benefits, and employers, who were anxious to fulfill the contracts, complied</u>. Thus, labor activism became a platform for Mexican American women to assert their agency.', NULL, 'Which choice best describes the function of the underlined portion in the text as a whole?', '{"A":"It elaborates on a claim about labor relations in a particular industry made earlier in the text.","B":"It offers an example of a trend in the World War II–era economy discussed earlier in the text.","C":"It notes a possible exception to the historical narrative of labor activism sketched earlier in the text.","D":"It provides further details about the identities of the workers discussed earlier in the text."}'::jsonb, NULL, 'A', NULL, NULL, 7)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 10, '1-10', 10, 'mcq', 'For many years, the only existing fossil evidence of mixopterid eurypterids—an extinct family of large aquatic arthropods known as sea scorpions and related to modern arachnids and horseshoe crabs—came from four species living on the paleocontinent of Laurussia. In a discovery that expands our understanding of the geographical distribution of mixopterids, paleontologist Bo Wang and others have identified fossilized remains of a new mixopterid species, <i>Terropterus xiushanensis</i>, that lived over 400 million years ago on the paleocontinent of Gondwana.', NULL, 'According to the text, why was Wang and his team’s discovery of the <i>Terropterus xiushanensis</i> fossil significant?', '{"A":"The fossil constitutes the first evidence found by scientists that mixopterids lived more than 400 million years ago.","B":"The fossil helps establish that mixopterids are more closely related to modern arachnids and horseshoe crabs than previously thought.","C":"The fossil helps establish a more accurate timeline of the evolution of mixopterids on the paleocontinents of Laurussia and Gondwana.","D":"The fossil constitutes the first evidence found by scientists that mixopterids existed outside the paleocontinent of Laurussia."}'::jsonb, NULL, 'D', NULL, NULL, 7)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 11, '1-11', 11, 'mcq', 'Video Game Availability by Initial Release Years

Initial release years | Percentage of games still available
1975–1979 | 0.89
1980–1984 | 3.65
1985–1989 | 15.38
1990–1994 | 19.33
1995–1999 | 14.22

In a recent study, researchers found that relatively few video games released over the decades remain available today. For example, only 14.22 percent of games are still available that were initially released in ______', NULL, 'Which choice most effectively uses data from the table to complete the statement?', '{"A":"2000–2004.","B":"1995–1999.","C":"1970–1974.","D":"1985–1989."}'::jsonb, NULL, 'B', NULL, NULL, 8)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 12, '1-12', 12, 'mcq', 'Depths at Which Four Deep-Sea Fish Species Live

Species | Depth below the ocean surface
Footballfish | 200–1,000 meters
Southern stoplight loosejaw | 500–2,000 meters
Black seadevil | 250–2,000 meters
Bollons’ rattail | 300–800 meters

Some oceanic fish species live very deep underwater. Researchers collected data about the depths at which various species live.', NULL, 'Based on the information in the table, at what depth does the southern stoplight loosejaw live?', '{"A":"More than 2,000 meters below the surface","B":"150 to 400 meters below the surface","C":"500 to 2,000 meters below the surface","D":"250 to 500 meters below the surface"}'::jsonb, NULL, 'C', NULL, NULL, 8)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 13, '1-13', 13, 'mcq', 'Housing Starts in the US, January–April 2022 (in thousands)

Month | Housing starts
January | 1,669
February | 1,771
March | 1,713
April | 1,803

When construction of a single-family house begins, it is called a housing start. In the first four months of 2022, the highest number of housing starts in the United States was in ______', NULL, 'Which choice most effectively uses data from the table to complete the statement?', '{"A":"April.","B":"March.","C":"January.","D":"February."}'::jsonb, NULL, 'A', NULL, NULL, 8)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 14, '1-14', 14, 'mcq', 'Born in 1891 to a Quechua-speaking family in the Andes Mountains of Peru, Martín Chambi is today considered to be one of the most renowned figures of Latin American photography. In a paper for an art history class, a student claims that Chambi’s photographs have considerable ethnographic value—in his work, Chambi was able to capture diverse elements of Peruvian society, representing his subjects with both dignity and authenticity.', NULL, 'Which finding, if true, would most directly support the student’s claim?', '{"A":"Chambi took many commissioned portraits of wealthy Peruvians, but he also produced hundreds of images carefully documenting the peoples, sites, and customs of Indigenous communities of the Andes.","B":"Chambi’s photographs demonstrate a high level of technical skill, as seen in his strategic use of illumination to create dramatic light and shadow contrasts.","C":"During his lifetime, Chambi was known and celebrated both within and outside his native Peru, as his work was published in places like Argentina, Spain, and Mexico.","D":"Some of the peoples and places Chambi photographed had long been popular subjects for Peruvian photographers."}'::jsonb, NULL, 'A', NULL, NULL, 9)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 15, '1-15', 15, 'mcq', 'Researchers hypothesized that a decline in the population of dusky sharks near the mid-Atlantic coast of North America led to a decline in the population of eastern oysters in the region. Dusky sharks do not typically consume eastern oysters but do consume cownose rays, which are the main predators of the oysters.', NULL, 'Which finding, if true, would most directly support the researchers’ hypothesis?', '{"A":"Declines in the regional abundance of dusky sharks’ prey other than cownose rays are associated with regional declines in dusky shark abundance.","B":"Eastern oyster abundance tends to be greater in areas with both dusky sharks and cownose rays than in areas with only dusky sharks.","C":"Consumption of eastern oysters by cownose rays in the region substantially increased before the regional decline in dusky shark abundance began.","D":"Cownose rays have increased in regional abundance as dusky sharks have decreased in regional abundance."}'::jsonb, NULL, 'D', NULL, NULL, 9)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 16, '1-16', 16, 'mcq', 'In the mountains of Brazil, <i>Barbacenia tomentosa</i> and <i>Barbacenia macrantha</i>—two plants in the Velloziaceae family—establish themselves on soilless, nutrient-poor patches of quartzite rock. Plant ecologists Anna Abrahão and Patricia de Britto Costa used microscopic analysis to determine that the roots of <i>B. tomentosa</i> and <i>B. macrantha</i>, which grow directly into the quartzite, have clusters of fine hairs near the root tip; further analysis indicated that these hairs secrete both malic and citric acids. The researchers hypothesize that the plants depend on dissolving underlying rock with these acids, as the process not only creates channels for continued growth but also releases phosphates that provide the vital nutrient phosphorus.', NULL, 'Which finding, if true, would most directly support the researchers’ hypothesis?', '{"A":"Other species in the Velloziaceae family are found in terrains with more soil but have root structures similar to those of <i>B. tomentosa</i> and <i>B. macrantha</i>.","B":"Though <i>B. tomentosa</i> and <i>B. macrantha</i> both secrete citric and malic acids, each species produces the acids in different proportions.","C":"The roots of <i>B. tomentosa</i> and <i>B. macrantha</i> carve new entry points into rocks even when cracks in the surface are readily available.","D":"<i>B. tomentosa</i> and <i>B. macrantha</i> thrive even when transferred to the surfaces of rocks that do not contain phosphates."}'::jsonb, NULL, 'C', NULL, NULL, 10)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 17, '1-17', 17, 'mcq', 'Many mosquito repellents contain natural components that work by activating multiple odor receptors on mosquitoes’ antennae. As the insects develop resistance, new repellents are needed. Ke Dong and her team found that EBF, a molecular component of a chrysanthemum-flower extract, can repel mosquitoes by activating just one odor receptor—and this receptor, Or31, is present in all mosquito species known to carry diseases. Therefore, the researchers suggest that in developing new repellents, it would be most useful to ______', NULL, 'Which choice most logically completes the text?', '{"A":"identify molecular components similar to EBF that target the activation of Or31 receptors.","B":"investigate alternative methods for extracting EBF molecules from chrysanthemums.","C":"verify the precise locations of Or31 and other odor receptors on mosquitoes’ antennae.","D":"determine the maximum number of different odor receptors that can be activated by a single molecule."}'::jsonb, NULL, 'A', NULL, NULL, 10)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 18, '1-18', 18, 'mcq', 'Birds of many species ingest foods containing carotenoids, pigmented molecules that are converted into feather coloration. Coloration tends to be especially saturated in male birds’ feathers, and because carotenoids also confer health benefits, the deeply saturated colors generally serve to communicate what is known as an honest signal of a bird’s overall fitness to potential mates. However, ornithologist Allison J. Shultz and others have found that males in several species of the tanager genus <i>Ramphocelus</i> use microstructures in their feathers to manipulate light, creating the appearance of deeper saturation without the birds necessarily having to maintain a carotenoid-rich diet. These findings suggest that ______', NULL, 'Which choice most logically completes the text?', '{"A":"individual male tanagers can engage in honest signaling without relying on carotenoid consumption.","B":"feather microstructures may be less effective than deeply saturated feathers for signaling overall fitness.","C":"scientists have yet to determine why tanagers have a preference for mates with colorful appearances.","D":"a male tanager’s appearance may function as a dishonest signal of the individual’s overall fitness."}'::jsonb, NULL, 'D', NULL, NULL, 11)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 19, '1-19', 19, 'mcq', 'When writing <i>The Other Black Girl</i> (2021), novelist Zakiya Dalila Harris drew on her own experiences working at a publishing office. The award-winning book is Harris’s first novel, but her writing ______ honored before. At the age of twelve, she entered a contest to have a story published in <i>American Girl</i> magazine—and won.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"were","B":"have been","C":"has been","D":"are"}'::jsonb, NULL, 'C', NULL, NULL, 11)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 20, '1-20', 20, 'mcq', 'In order to prevent nonnative fish species from moving freely between the Mediterranean and Red Seas, marine biologist Bella Galil has proposed that a saline lock system be installed along the Suez Canal in Egypt’s Great Bitter Lakes. The lock would increase the salinity of the lakes and ______ a natural barrier of water most marine creatures would be unable to cross.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"creates","B":"create","C":"creating","D":"created"}'::jsonb, NULL, 'B', NULL, NULL, 11)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 21, '1-21', 21, 'mcq', 'Paintings by the renowned twentieth-century US ______ were featured in <i>Artist to Artist</i>, an exhibition at the Smithsonian Art Museum that paired the works of artists whose career trajectories intersected in meaningful ways.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"artists: Thomas Hart Benton and Jackson Pollock,","B":"artists Thomas Hart Benton and Jackson Pollock","C":"artists Thomas Hart Benton, and Jackson Pollock,","D":"artists, Thomas Hart Benton and Jackson Pollock"}'::jsonb, NULL, 'B', NULL, NULL, 12)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 22, '1-22', 22, 'mcq', 'In 1943, in the midst of World War II, mathematics professor Grace Hopper was recruited by the US military to help the war effort by solving complex equations. Hopper’s subsequent career would involve more than just ______ as a pioneering computer programmer, Hopper would help usher in the digital age.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"equations, though:","B":"equations, though,","C":"equations. Though,","D":"equations though"}'::jsonb, NULL, 'A', NULL, NULL, 12)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 23, '1-23', 23, 'mcq', 'Increased gender diversity is revitalizing the field of economics, according to Harvard’s Claudia Goldin. The trailblazing accomplishments of Goldin, winner of the 2023 Nobel Prize in Economics for her work on women in the labor force, ______ to the value of scholars of diverse backgrounds in spurring research into previously unexplored, but vitally important, topics.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"attests","B":"has attested","C":"is attesting","D":"attest"}'::jsonb, NULL, 'D', NULL, NULL, 12)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 24, '1-24', 24, 'mcq', 'During the English neoclassical period (1660–1789), many writers imitated the epic poetry and satires of ancient Greece and Rome. They were not the first in England to adopt the literary modes of classical ______ some of the most prominent figures of the earlier Renaissance period were also influenced by ancient Greek and Roman literature.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"antiquity, however","B":"antiquity, however,","C":"antiquity, however;","D":"antiquity; however,"}'::jsonb, NULL, 'C', NULL, NULL, 12)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 25, '1-25', 25, 'mcq', 'English poet and Shakespeare contemporary John Donne’s ______ much admired during his lifetime (1572–1631) and in the decades that followed, had, at the time of their enthusiastic rediscovery by the early twentieth-century modernists, been essentially gathering dust for the intervening 250 years.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"works were","B":"works, were","C":"works,","D":"works had been"}'::jsonb, NULL, 'C', NULL, NULL, 13)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 26, '1-26', 26, 'mcq', 'Compared to that of alumina glass, ______ silica glass atoms are so far apart that they are unable to re-form bonds after being separated.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"silica glass is at a significant disadvantage due to its more dispersed atomic arrangement:","B":"silica glass has a more dispersed atomic arrangement, resulting in a significant disadvantage:","C":"a significant disadvantage of silica glass is that its atomic arrangement is more dispersed:","D":"silica glass’s atomic arrangement is more dispersed, resulting in a significant disadvantage:"}'::jsonb, NULL, 'D', NULL, NULL, 13)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 27, '1-27', 27, 'mcq', 'In November 1934, Amrita Sher-Gil was living in what must have seemed like the ideal city for a young artist: Paris. She was studying firsthand the color-saturated style of France’s modernist masters and beginning to make a name for herself as a painter. ______ Sher-Gil longed to return to her childhood home of India; only there, she believed, could her art truly flourish.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"Still,","B":"Therefore,","C":"Indeed,","D":"Furthermore,"}'::jsonb, NULL, 'A', NULL, NULL, 13)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 28, '1-28', 28, 'mcq', 'In 1974, Mexican chemist Mario Molina and US chemist F. Sherwood Rowland discovered that chemicals called CFCs were harmful to the ozone layer. Their research was extremely influential in the fight against CFCs. ______ it laid the foundation for a 1987 treaty that phased out the use of CFCs across the globe.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"Regardless,","B":"Specifically,","C":"However,","D":"Earlier,"}'::jsonb, NULL, 'B', NULL, NULL, 13)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 29, '1-29', 29, 'mcq', 'With his room-sized installation Unicorn/My Private Sky, Norwegian artist Børre Sæthre succeeds in creating a whimsical yet perplexing experience. ______ when visitors set foot inside the fantastically blue room and encounter the life-sized stuffed unicorn preening at the far end of it, they are both dazzled and confused—as if stepping into a strange and enchanting new world.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"Second,","B":"Instead,","C":"Indeed,","D":"Nevertheless,"}'::jsonb, NULL, 'C', NULL, NULL, 14)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 30, '1-30', 30, 'mcq', 'While researching a topic, a student has taken the following notes:
• The Philadelphia and Lancaster Turnpike was a road built between 1792 and 1794.
• It was the first private turnpike in the United States.
• It connected the cities of Philadelphia and Lancaster in the state of Pennsylvania.
• It was sixty-two miles long.

The student wants to emphasize the distance covered by the Philadelphia and Lancaster Turnpike.', NULL, 'Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"The sixty-two-mile-long Philadelphia and Lancaster Turnpike connected the Pennsylvania cities of Philadelphia and Lancaster.","B":"The Philadelphia and Lancaster Turnpike was the first private turnpike in the United States.","C":"The Philadelphia and Lancaster Turnpike, which connected two Pennsylvania cities, was built between 1792 and 1794.","D":"A historic Pennsylvania road, the Philadelphia and Lancaster Turnpike was completed in 1794."}'::jsonb, NULL, 'A', NULL, NULL, 14)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 31, '1-31', 31, 'mcq', 'While researching a topic, a student has taken the following notes:
• Most, but not all, of the Moon’s oxygen comes from the Sun, via solar wind.
• Cosmochemist Kentaro Terada from Osaka University wondered if some of the unaccounted-for oxygen could be coming from Earth.
• In 2008, he analyzed data from the Japanese satellite Kaguya.
• Kaguya gathered data about gases and particles it encountered while orbiting the Moon.
• Based on the Kaguya data, Terada confirmed his suspicion that Earth is sending oxygen to the Moon.

The student wants to emphasize the aim of the research study.', NULL, 'Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"As it orbited the Moon, the Kaguya satellite collected data that was later analyzed by cosmochemist Kentaro Terada.","B":"Before 2008, Kentaro Terada wondered if the Moon was receiving some of its oxygen from Earth.","C":"Cosmochemist Kentaro Terada set out to determine whether some of the Moon’s oxygen was coming from Earth.","D":"Kentaro Terada’s study determined that Earth is sending a small amount of oxygen to the Moon."}'::jsonb, NULL, 'C', NULL, NULL, 14)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 32, '1-32', 32, 'mcq', 'While researching a topic, a student has taken the following notes:
• The factors that affect clutch size (the number of eggs laid at one time) have been well studied in birds but not in lizards.
• A team led by Shai Meiri of Tel Aviv University investigated which factors influence lizard clutch size.
• Meiri’s team obtained clutch-size and habitat data for over 3,900 lizard species and analyzed the data with statistical models.
• Larger clutch size was associated with environments in higher latitudes that have more seasonal change.
• Lizards in higher-latitude environments may lay larger clutches to take advantage of shorter windows of favorable conditions.

The student wants to emphasize the aim of the research study.', NULL, 'Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"Researchers wanted to know which factors influence lizard egg clutch size because such factors have been well studied in birds but not in lizards.","B":"After they obtained data for over 3,900 lizard species, researchers determined that larger clutch size was associated with environments in higher latitudes that have more seasonal change.","C":"We now know that lizards in higher-latitude environments may lay larger clutches to take advantage of shorter windows of favorable conditions.","D":"Researchers obtained clutch-size and habitat data for over 3,900 lizard species and analyzed the data with statistical models."}'::jsonb, NULL, 'A', NULL, NULL, 15)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 33, '1-33', 33, 'mcq', 'While researching a topic, a student has taken the following notes:
• British musicians John Lennon and Paul McCartney shared writing credit for numerous Beatles songs.
• Many Lennon-McCartney songs were actually written by either Lennon or McCartney, not by both.
• The exact authorship of specific parts of many Beatles songs, such as the verse for “In My Life,” is disputed.
• Mark Glickman, Jason Brown, and Ryan Song used statistical methods to analyze the musical content of Beatles songs.
• They concluded that there is 18.9% probability that McCartney wrote the verse for “In My Life,” stating that the verse is “consistent with Lennon’s songwriting style.”

The student wants to make a generalization about the kind of study conducted by Glickman, Brown, and Song.', NULL, 'Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"Based on statistical analysis, Glickman, Brown, and Song claim that John Lennon wrote the verse of “In My Life.”","B":"There is only an 18.9% probability that Paul McCartney wrote the verse for “In My Life”; John Lennon is the more likely author.","C":"It is likely that John Lennon, not Paul McCartney, wrote the verse for “In My Life.”","D":"Researchers have used statistical methods to address questions of authorship within the field of music."}'::jsonb, NULL, 'D', NULL, NULL, 16)
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
  VALUES (v_mod, 1, '2-1', 1, 'mcq', 'Art scholars have noted that some colors seem to be more ______ viewers than others. For example, people tend to find paintings featuring blues and greens more appealing than paintings featuring yellows and oranges.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"confusing for","B":"attractive to","C":"corrected by","D":"similar to"}'::jsonb, NULL, 'B', NULL, NULL, 18)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 2, '2-2', 2, 'mcq', 'Researchers and conservationists stress that biodiversity loss due to invasive species is ______. For example, people can take simple steps such as washing their footwear after travel to avoid introducing potentially invasive organisms into new environments.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"preventable","B":"undeniable","C":"common","D":"concerning"}'::jsonb, NULL, 'A', NULL, NULL, 18)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 3, '2-3', 3, 'mcq', 'The process of mechanically recycling plastics is often considered ______ because of the environmental impact and the loss of material quality that often occurs. But chemist Takunda Chazovachii has helped develop a cleaner process of chemical recycling that converts superabsorbent polymers from diapers into a desirable reusable adhesive.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"resilient","B":"inadequate","C":"dynamic","D":"satisfactory"}'::jsonb, NULL, 'B', NULL, NULL, 18)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 4, '2-4', 4, 'mcq', 'In the Indigenous intercropping system known as the Three Sisters, maize, squash, and beans form an ______ web of relations: maize provides the structure on which the bean vines grow; the squash vines cover the soil, discouraging competition from weeds; and the beans aid their two “sisters” by enriching the soil with essential nitrogen.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"indecipherable","B":"ornamental","C":"obscure","D":"intricate"}'::jsonb, NULL, 'D', NULL, NULL, 19)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 5, '2-5', 5, 'mcq', 'Within baleen whale species, some individuals develop an accessory spleen—a seemingly functionless formation of splenetic tissue outside the normal spleen. Given the formation’s greater prevalence among whales known to make deeper dives, some researchers hypothesize that its role isn’t ______; rather, the accessory spleen may actively support diving mechanisms.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"replicable","B":"predetermined","C":"operative","D":"latent"}'::jsonb, NULL, 'D', NULL, NULL, 19)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 6, '2-6', 6, 'mcq', 'In 2007, computer scientist Luis von Ahn was working on converting printed books into a digital format. He found that some words were distorted enough that digital scanners couldn’t recognize them, but most humans could easily read them. Based on that finding, von Ahn invented a simple security test to keep automated “bots” out of websites. The first version of the reCAPTCHA test asked users to type one known word and one of the many words scanners couldn’t recognize. Correct answers proved the users were humans and added data to the book-digitizing project.', NULL, 'Which choice best states the main purpose of the text?', '{"A":"To discuss von Ahn’s invention of reCAPTCHA","B":"To explain how digital scanners work","C":"To call attention to von Ahn’s book-digitizing project","D":"To indicate how popular reCAPTCHA is"}'::jsonb, NULL, 'A', NULL, NULL, 19)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 7, '2-7', 7, 'mcq', 'The following text is adapted from Gwendolyn Bennett’s 1926 poem “Street Lamps in Early Spring.”

Night wears a garment
All velvet soft, all violet blue...
And over her face she draws a veil
As shimmering fine as floating dew...
And here and there
In the black of her hair
The subtle hands of Night
Move slowly with their gem-starred light.', NULL, 'Which choice best describes the overall structure of the text?', '{"A":"It presents alternating descriptions of night in a rural area and in a city.","B":"It sketches an image of nightfall, then an image of sunrise.","C":"It makes an extended comparison of night to a human being.","D":"It portrays how night changes from one season of the year to the next."}'::jsonb, NULL, 'C', NULL, NULL, 19)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 8, '2-8', 8, 'mcq', 'The following text is adapted from Jane Austen’s 1814 novel <i>Mansfield Park</i>. The speaker, Tom, is considering staging a play at home with a group of his friends and family.

We mean nothing but a little amusement among ourselves, just to vary the scene, and exercise our powers in something new. We want no audience, no publicity. We may be trusted, I think, in choosing some play most perfectly unexceptionable; and I can conceive no greater harm or danger to any of us in conversing in the elegant written language of some respectable author than in chattering in words of our own.', NULL, 'Which choice best states the main purpose of the text?', '{"A":"To offer Tom’s assurance that the play will be inoffensive and involve only a small number of people","B":"To clarify that the play will not be performed in the manner Tom had originally intended","C":"To elaborate on the idea that the people around Tom lack the skills to successfully stage a play","D":"To assert that Tom believes the group performing the play will be able to successfully promote it"}'::jsonb, NULL, 'A', NULL, NULL, 20)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 9, '2-9', 9, 'mcq', 'Text 1
Ecologists have long wondered how thousands of microscopic phytoplankton species can live together near ocean surfaces competing for the same resources. According to conventional wisdom, one species should emerge after outcompeting the rest. So why do so many species remain? Ecologists’ many efforts to explain this phenomenon still haven’t uncovered a satisfactory explanation.

Text 2
Ecologist Michael Behrenfeld and colleagues have connected phytoplankton’s diversity to their microscopic size. Because these organisms are so tiny, they are spaced relatively far apart from each other in ocean water and, moreover, experience that water as a relatively dense substance. This in turn makes it hard for them to move around and interact with one another. Therefore, says Behrenfeld’s team, direct competition among phytoplankton probably happens much less than previously thought.', NULL, 'Based on the texts, how would Behrenfeld and colleagues (Text 2) most likely respond to the “conventional wisdom” discussed in Text 1?', '{"A":"By arguing that it is based on a misconception about phytoplankton species competing with one another","B":"By asserting that it fails to recognize that routine replenishment of ocean nutrients prevents competition between phytoplankton species","C":"By suggesting that their own findings help clarify how phytoplankton species are able to compete with larger organisms","D":"By recommending that more ecologists focus their research on how competition among phytoplankton species is increased with water density"}'::jsonb, NULL, 'A', NULL, NULL, 20)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 10, '2-10', 10, 'mcq', 'The following text is adapted from Sylvia Acevedo’s 2018 memoir Path to the Stars: My Journey from Girl <i>Scout to Rocket Scientist</i>. The narrator is traveling by car with her family to Mexico City. Mario and Laura are her brother and sister.

Mario and I played games to see how many different license plates we could spot, and Laura liked to look for children in the back seats of the cars we passed. We were used to the forty-five-minute drive to El Paso and familiar with the six-hour ride to Chihuahua, but I wondered what the long journey to Mexico City would be like.', NULL, 'According to the text, what did the narrator and Mario do while riding in the car?', '{"A":"They read books.","B":"They sang songs.","C":"They went to sleep.","D":"They played games."}'::jsonb, NULL, 'D', NULL, NULL, 21)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 11, '2-11', 11, 'mcq', 'In the 1700s and 1800s, European composers experimented with volume in their musical works. They did so by increasing the number of musicians playing in the orchestra. For example, in some of his operas, German composer Richard Wagner added more horns, trombones, and tubas to the orchestra. With more instruments playing at the same time, the orchestra could play extremely loudly at key moments in his operas.', NULL, 'According to the text, how did Richard Wagner achieve moments of extremely high volume in his operas?', '{"A":"By moving the performances of his operas from outdoor stages to indoor ones","B":"By increasing the number of musicians playing horns, trombones, and tubas in the orchestra","C":"By building a concert hall whose shape would cause sounds to echo","D":"By insisting that the singers undergo special training to sing for extended periods of time"}'::jsonb, NULL, 'B', NULL, NULL, 21)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 12, '2-12', 12, 'mcq', 'Poetry in Classical Nahuatl, the language of the Aztec Empire, relies on <i>difrasismo</i>, or a parallel noun construction that conventionally operates as a single metaphor. For example, the common <i>difrasismo</i> in <i>cuauhtli in <i>ocelotl</i></i> (literally, “the eagle, the jaguar”) signifies “warrior.” The device’s function is both formal—providing structure to lines of verse—and ritual: semantic relations among the two nouns and the concept they signify can be tenuous, as in the previous example, such that difrasismos are often only intelligible according to the conceptual associations observed in Aztec ceremonial culture.', NULL, 'Which statement about the <i>difrasismo</i> in <i>cuauhtli in <i>ocelotl</i></i> is most strongly supported by the text?', '{"A":"Its metaphorical significance derives from the semantic equivalence of the two nouns constituting the <i>difrasismo</i>.","B":"Its unintelligibility may cause its formal function within a line of verse to go unnoticed by present-day readers.","C":"Its apparent obscurity can be resolved when considered in the proper cultural context.","D":"Its frequency in Classical Nahuatl poetry confirms its intelligibility to the Aztec audience."}'::jsonb, NULL, 'C', NULL, NULL, 22)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 13, '2-13', 13, 'mcq', 'Eighteenth-century economist Adam Smith is famed for his metaphor of the invisible hand, which he putatively used to illustrate a robust model of how individuals produce aggregate benefits by pursuing their own economic interests. Note “putatively”: as Gavin Kennedy has shown, Smith deploys this metaphor only once in his economic writings—to make a narrow point about the then-dominant economic theory of mercantilism—and it was largely ignored until some twentieth-century economists eager to secure an intellectual pedigree for their views elevated it to a fully-fledged paradigm.', NULL, 'Which choice best states the main idea of the text?', '{"A":"Although Smith is famed for his metaphor of the invisible hand, the metaphor was largely ignored until economists in the twentieth century came to realize that the metaphor was a robust model that anticipated their own views.","B":"Some twentieth-century economists gave Smith’s metaphor of the invisible hand a significance it does not have in Smith’s work, but it is nevertheless a useful model of how individuals produce aggregate benefits by pursuing their own economic interests.","C":"Smith’s metaphor of the invisible hand has been interpreted as a model of how individuals acting in their own interest produce aggregate benefits, but it was intended as a subtle critique of the economic theory of mercantilism.","D":"The reputation of Smith’s metaphor of the invisible hand is not due to the importance of the metaphor in Smith’s work but rather to the promotion of the metaphor by some later economists for their own ends."}'::jsonb, NULL, 'D', NULL, NULL, 22)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 14, '2-14', 14, 'mcq', 'Table titled “Approximate Rates of Speech and Information Conveyed for Five Languages” with columns: Language; Rate of speech (syllables per second); Rate of information conveyed (bits per second). Rows: Serbian, 7.2, 39.1; Spanish, 7.7, 42.0; Vietnamese, 5.3, 42.5; Thai, 4.7, 33.8; Hungarian, 5.9, 34.6.

A group of researchers working in Europe, Asia, and Oceania conducted a study to determine how quickly different Eurasian languages are typically spoken (in syllables per second) and how much information they can effectively convey (in bits per second). They found that, although languages vary widely in the speed at which they are spoken, the amount of information languages can effectively convey tends to vary much less. Thus, they claim that two languages with very different spoken rates can nonetheless convey the same amount of information in a given amount of time.', NULL, 'Which choice best describes data from the table that support the researchers’ claim?', '{"A":"Among the five languages in the table, Thai and Hungarian have the lowest rates of speech and the lowest rates of information conveyed.","B":"Vietnamese conveys information at approximately the same rate as Spanish despite being spoken at a slower rate.","C":"Among the five languages in the table, the language that is spoken the fastest is also the language that conveys information the fastest.","D":"Serbian and Spanish are spoken at approximately the same rate, but Serbian conveys information faster than Spanish does."}'::jsonb, NULL, 'B', NULL, NULL, 23)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 15, '2-15', 15, 'mcq', 'Table titled “Estimates of Tyrannosaurid Bite Force” with columns: Study; Year; Estimation method; Approximate bite force (newtons). Rows: Cost et al., 2019, muscular and skeletal modeling, 35,000–63,000; Gignac and Erickson, 2017, tooth-bone interaction analysis, 8,000–34,000; Meers, 2002, body-mass scaling, 183,000–235,000; Bates and Falkingham, 2012, muscular and skeletal modeling, 35,000–57,000.

The largest tyrannosaurids—the family of carnivorous dinosaurs that includes <i>Tarbosaurus</i>, <i>Albertosaurus</i>, and, most famously, <i>Tyrannosaurus rex</i>—are thought to have had the strongest bites of any land animals in Earth’s history. Determining the bite force of extinct animals can be difficult, however, and paleontologists Paul Barrett and Emily Rayfield have suggested that an estimate of dinosaur bite force may be significantly influenced by the methodology used in generating that estimate.', NULL, 'Which choice best describes data from the table that support Barrett and Rayfield’s suggestion?', '{"A":"The study by Meers used body-mass scaling and produced the lowest estimated maximum bite force, while the study by Cost et al. used muscular and skeletal modeling and produced the highest estimated maximum.","B":"In their study, Gignac and Erickson used tooth-bone interaction analysis to produce an estimated bite force range with a minimum of 8,000 newtons and a maximum of 34,000 newtons.","C":"The bite force estimates produced by Bates and Falkingham and by Cost et al. were similar to each other, while the estimates produced by Meers and by Gignac and Erickson each differed substantially from any other estimate.","D":"The estimated maximum bite force produced by Cost et al. exceeded the estimated maximum produced by Bates and Falkingham, even though both groups of researchers used the same method to generate their estimates."}'::jsonb, NULL, 'C', NULL, NULL, 24)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 16, '2-16', 16, 'mcq', 'Psychologists Dacher Keltner and Jonathan Haidt have argued that experiencing awe—a sensation of reverence and wonder typically brought on by perceiving something grand or powerful—can enable us to feel more connected to others and thereby inspire us to act more altruistically. Keltner, along with Paul K. Piff, Pia Dietze, and colleagues, claims to have found evidence for this effect in a recent study where participants were asked to either gaze up at exceptionally tall trees in a nearby grove (reported to be a universally awe-inspiring experience) or stare at the exterior of a nearby, nondescript building. After one minute, an experimenter deliberately spilled a box of pens nearby.', NULL, 'Which finding from the researchers’ study, if true, would most strongly support their claim?', '{"A":"Participants who had been looking at the trees helped the experimenter pick up significantly more pens than did participants who had been looking at the building.","B":"Participants who helped the experimenter pick up the pens used a greater number of positive words to describe the trees and the building in a postexperiment survey than did participants who did not help the experimenter.","C":"Participants who did not help the experimenter pick up the pens were significantly more likely to report having experienced a feeling of awe, regardless of whether they looked at the building or the trees.","D":"Participants who had been looking at the building were significantly more likely to notice that the experimenter had dropped the pens than were participants who had been looking at the trees."}'::jsonb, NULL, 'A', NULL, NULL, 25)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 17, '2-17', 17, 'mcq', 'The domestic sweet potato (<i>Ipomoea batatas</i>) descends from a wild plant native to South America. It also populates the Polynesian Islands, where evidence confirms that Native Hawaiians and other Indigenous peoples were cultivating the plant centuries before seafaring first occurred over the thousands of miles of ocean separating them from South America. To explain how the sweet potato was first introduced in Polynesia, botanist Pablo Muñoz-Rodríguez and colleagues analyzed the DNA of numerous varieties of the plant, concluding that Polynesian varieties diverged from South American ones over 100,000 years ago. Given that Polynesia was peopled only in the last three thousand years, the team concluded that ______', NULL, 'Which choice most logically completes the text?', '{"A":"the cultivation of the sweet potato in Polynesia likely predates its cultivation in South America.","B":"Polynesian peoples likely acquired the sweet potato from South American peoples only within the last three thousand years.","C":"human activity likely played no role in the introduction of the sweet potato in Polynesia.","D":"Polynesian sweet potato varieties likely descend from a single South American variety that was domesticated, not wild."}'::jsonb, NULL, 'C', NULL, NULL, 25)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 18, '2-18', 18, 'mcq', 'The morphological novelty of echinoderms—marine invertebrates with radial symmetry, usually starlike, around a central point—impedes comparisons with most other animals, in which bilateral symmetry on an anterior-posterior (head to tail) axis through a trunk is typical. Particularly puzzling are sea stars, thought to have evolved a headless layout from a known bilateral origin. Applying genomic knowledge of <i>Saccoglossus kowalevskii</i> acorn worms (close relatives of sea stars, and thus expected to have similar markers for corresponding anatomical regions) to the body patterning genes of <i>Patiria</i> <i>miniata</i> sea stars, Laurent Formery et al. observed activity only in anterior genes across <i>P. <i>miniata</i></i>’s entire body and some posterior genes limited to the edges, suggesting that ______', NULL, 'Which choice most logically completes the text?', '{"A":"despite the greater prevalence of anterior genes in sea stars’ genetic makeup, posterior genes active at the body’s perimeter are primarily responsible for the starlike layout that distinguishes sea stars’ radial symmetry from that of other echinoderms.","B":"contrary to the belief that they evolved from early ancestors with the bilateral form typical of many other animals, sea stars instead originated with an atypical body layout that was neither bilaterally nor radially symmetrical.","C":"although the two species are closely related, there is only minimal correspondence in the genetic markers for head, tail, and trunk region development in <i>P. <i>miniata</i></i> sea stars and <i>S. kowalevskii</i> acorn worms.","D":"rather than undergoing changes resulting in the eventual elimination of a head region in their radial body plan, as previously assumed, sea stars’ morphology evolved to completely lack a trunk and consist primarily of a head region."}'::jsonb, NULL, 'D', NULL, NULL, 26)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 19, '2-19', 19, 'mcq', 'To survive when water is scarce, embryos inside African turquoise killifish eggs ______ a dormant state known as diapause. In this state, embryonic development is paused for as long as two years—longer than the life span of an adult killifish.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"enter","B":"to enter","C":"having entered","D":"entering"}'::jsonb, NULL, 'A', NULL, NULL, 26)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 20, '2-20', 20, 'mcq', 'Formed in 1967 to foster political and economic stability within the Asia-Pacific region, the Association of Southeast Asian Nations was originally made up of five members: Thailand, the Philippines, Singapore, Malaysia, and Indonesia. By the end of the 1990s, the organization ______ its initial membership.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"has doubled","B":"had doubled","C":"doubles","D":"will double"}'::jsonb, NULL, 'B', NULL, NULL, 26)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 21, '2-21', 21, 'mcq', 'After the United Kingdom began rolling out taxes equivalent to a few cents on single-use plastic grocery bags in 2011, plastic-bag consumption decreased by up to ninety ______ taxes are subject to what economists call the “rebound effect”: as the change became normalized, plastic-bag use started to creep back up.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"percent, such","B":"percent and such","C":"percent. Such","D":"percent such"}'::jsonb, NULL, 'C', NULL, NULL, 27)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 22, '2-22', 22, 'mcq', 'In 1966, Emmett Ashford became the first African American to umpire a Major League Baseball game. His energetic gestures announcing when a player had struck out and his habit of barreling after a hit ball to see if it would land out of ______ transform the traditionally solemn umpire role into a dynamic one.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"bounds helped","B":"bounds, helping","C":"bounds that helped","D":"bounds to help"}'::jsonb, NULL, 'A', NULL, NULL, 27)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 23, '2-23', 23, 'mcq', 'The forty-seven geothermal springs of Arkansas’ Hot Springs National Park are sourced via a process known as natural groundwater recharge, in which rainwater percolates downward through the earth—in this case, the porous rocks of the hills around Hot ______ collect in a subterranean basin.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"Springs to","B":"Springs: to","C":"Springs—to","D":"Springs, to"}'::jsonb, NULL, 'C', NULL, NULL, 27)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 24, '2-24', 24, 'mcq', 'Over twenty years ago, in a landmark experiment in the psychology of choice, professor Sheena Iyengar set up a jam-tasting booth at a grocery store. The number of jams available for tasting ______ some shoppers had twenty-four different options, others only six. Interestingly, the shoppers with fewer jams to choose from purchased more jam.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"varied:","B":"varied,","C":"varied, while","D":"varied while"}'::jsonb, NULL, 'A', NULL, NULL, 27)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 25, '2-25', 25, 'mcq', 'Nigerian author Buchi Emecheta’s celebrated literary oeuvre includes <i>The Joys of Motherhood</i>, a novel about the changing roles of women in 1950s ______ a television play about the private struggles of a newlywed couple in Nigeria; and <i>Head Above Water</i>, her autobiography.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"Lagos, <i>A Kind of Marriage</i>,","B":"Lagos; <i>A Kind of Marriage</i>,","C":"Lagos, <i>A Kind of Marriage</i>:","D":"Lagos; <i>A Kind of Marriage</i>"}'::jsonb, NULL, 'B', NULL, NULL, 28)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 26, '2-26', 26, 'mcq', 'Jetties—long, narrow structures that extend from a landmass into the water—are often constructed to protect coastlines from erosion. Jetties can sometimes have the opposite ______ obstructing the natural flow of sand along the shore can lead to increased erosion in some areas.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"effect, though;","B":"effect, though","C":"effect; though","D":"effect, though,"}'::jsonb, NULL, 'A', NULL, NULL, 28)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 27, '2-27', 27, 'mcq', 'The Alaska Native Language Archive (ANLA) is known for its impressive audio collection. ______ the ANLA has more than 5,000 audio recordings of Native Alaskan languages dating as far back as 1943.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"In fact,","B":"After,","C":"Regardless,","D":"Instead,"}'::jsonb, NULL, 'A', NULL, NULL, 28)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 28, '2-28', 28, 'mcq', 'Etched into Peru’s Nazca Desert are line drawings so large that they can only be fully seen from high above. Archaeologists have known of the lines since the 1920s, when a researcher spotted some from a nearby foothill, and they have been studying the markings ever since. ______ archaeologists’ efforts are aided by drones that capture high-resolution aerial photographs of the lines.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"Currently,","B":"In comparison,","C":"Still,","D":"However,"}'::jsonb, NULL, 'A', NULL, NULL, 28)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 29, '2-29', 29, 'mcq', 'At two weeks old, the time their critical socialization period begins, wolves can smell but cannot yet see or hear. Domesticated dogs, ______ can see, hear, and smell by the end of two weeks. This relative lack of sensory input may help explain why wolves behave so differently around humans than dogs do: from a very young age, wolves are more wary and less exploratory.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"in other words,","B":"for instance,","C":"by contrast,","D":"accordingly,"}'::jsonb, NULL, 'C', NULL, NULL, 29)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 30, '2-30', 30, 'mcq', 'Upon first approaching artist Kurt Wenner’s Dies Irae, a colorful scene painted on the surface of a cobblestone street in Mantua, Italy, one might assume a deep hole filled with life-sized, classically styled sculptures had opened up in the street. ______ by expertly applying the principles of perspective, Wenner created merely the illusion of depth.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"Additionally,","B":"On the contrary,","C":"As a result,","D":"Next,"}'::jsonb, NULL, 'B', NULL, NULL, 29)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 31, '2-31', 31, 'mcq', 'Economist Elinor Ostrom’s studies of communities around the world have empirically demonstrated that common pool resources, such as grazing lands, can be sustainably managed by the people who use them (rather than through private entities or centralized governments). ______ Ostrom’s work is a repudiation of the “tragedy of the commons,” the view that individuals will inevitably overexploit a finite shared resource if given unfettered access to it.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"By contrast,","B":"For example,","C":"That said,","D":"As such,"}'::jsonb, NULL, 'D', NULL, NULL, 29)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 32, '2-32', 32, 'mcq', 'While researching a topic, a student has taken the following notes:

• Some sandstone arches in Utah’s Arches National Park have been defaced by tourists’ carvings.
• Park rangers can smooth away some carvings using power grinders.
• For deep carvings, power grinding is not always feasible because it can greatly alter or damage the rock.
• Park rangers can use an infilling technique, which involves filling in carvings with ground sandstone and a bonding agent.
• This technique is minimally invasive.', NULL, 'The student wants to explain an advantage of the infilling technique. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"To remove carvings from sandstone arches in Utah’s Arches National Park, power grinding is not always feasible.","B":"Filling in carvings with ground sandstone and a bonding agent is less invasive than smoothing them away with a power grinder, which can greatly alter or damage the sandstone arches.","C":"Park rangers can use a power grinding technique to smooth away carvings or fill them in with ground sandstone and a bonding agent.","D":"As methods for removing carvings from sandstone, power grinding and infilling differ in their level of invasiveness."}'::jsonb, NULL, 'B', NULL, NULL, 30)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 33, '2-33', 33, 'mcq', 'While researching a topic, a student has taken the following notes:

• Las sergas de Esplandián was a novel popular in sixteenth-century Spain.
• The novel featured a fictional island inhabited solely by Black women and known as California.
• That same century, Spanish explorers learned of an “island” off the west coast of Mexico.
• They called it California after the island in the novel.
• The “island” was actually the peninsula now known as Baja California (“Lower California”), which lies to the south of the US state of California.', NULL, 'The student wants to emphasize the role a misconception played in the naming of a place. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"The novel Las sergas de Esplandián featured a fictional island known as California.","B":"To the south of the US state of California lies Baja California (“Lower California”), originally called California after a fictional place.","C":"In the sixteenth century, Spanish explorers learned of a peninsula off the west coast of Mexico and called it California.","D":"Thinking it was an island, Spanish explorers called a peninsula California after an island in a popular novel."}'::jsonb, NULL, 'D', NULL, NULL, 30)
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
  VALUES (v_mod, 1, '3-1', 1, 'mcq', NULL, NULL, 'A bus is traveling at a constant speed along a straight portion of road. The equation $d = 30t$ gives the distance $d$, in feet from a road marker, that the bus will be $t$ seconds after passing the marker. How many feet from the marker will the bus be 2 seconds after passing the marker?', '{"A":"30","B":"32","C":"60","D":"90"}'::jsonb, NULL, 'C', NULL, NULL, 34)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 2, '3-2', 2, 'mcq', NULL, NULL, 'For a particular machine that produces beads, 29 out of every 100 beads it produces have a defect. A bead produced by the machine will be selected at random. What is the probability of selecting a bead that has a defect?', '{"A":"$\\frac{1}{2,900}$","B":"$\\frac{1}{29}$","C":"$\\frac{29}{100}$","D":"$\\frac{29}{10}$"}'::jsonb, NULL, 'C', NULL, NULL, 34)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 3, '3-3', 3, 'mcq', NULL, 'A coordinate plane with the x-axis labeled from -10 to 10 and the y-axis labeled to about 14. An increasing curve rises from the lower left, passing upward through the y-axis. The curve crosses the y-axis at the point (0, 8).', 'What is the $y$-intercept of the graph shown?', '{"A":"$(-8, 0)$","B":"$(-6, 0)$","C":"$(0, 6)$","D":"$(0, 8)$"}'::jsonb, '/data/tests/cb-og-8/figures/m3-q3.png', 'D', NULL, NULL, 34)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 4, '3-4', 4, 'mcq', NULL, NULL, 'Which expression is equivalent to $(2x^2 + x - 9) + (x^2 + 6x + 1)$ ?', '{"A":"$2x^2 + 7x + 10$","B":"$2x^2 + 6x - 8$","C":"$3x^2 + 7x - 10$","D":"$3x^2 + 7x - 8$"}'::jsonb, NULL, 'D', NULL, NULL, 34)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 5, '3-5', 5, 'mcq', NULL, NULL, 'An analyst collected data on the price of a carton of grape tomatoes at 30 locations selected at random in Utah. The mean price of a carton of grape tomatoes in Utah was estimated to be $4.23, with an associated margin of error of $0.08. Which of the following is a plausible statement about the mean price of a carton of grape tomatoes for all locations that sell this product in Utah?', '{"A":"It is between $4.15 and $4.31.","B":"It is either less than $4.15 or greater than $4.31.","C":"It is less than $4.15.","D":"It is greater than $4.31."}'::jsonb, NULL, 'A', NULL, NULL, 35)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 6, '3-6', 6, 'grid', NULL, NULL, '$2.6 + x = 2.8$

What value of $x$ is the solution to the given equation?', NULL, NULL, '0.2', '["0.2","1/5"]'::jsonb, NULL, 35)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 7, '3-7', 7, 'grid', NULL, NULL, 'Out of 300 seeds that were planted, 80% sprouted. How many of these seeds sprouted?', NULL, NULL, '240', '["240"]'::jsonb, NULL, 35)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 8, '3-8', 8, 'mcq', NULL, NULL, '$f(x) = 4x + b$

For the linear function $f$, $b$ is a constant and $f(7) = 28$. What is the value of $b$ ?', '{"A":"0","B":"1","C":"4","D":"7"}'::jsonb, NULL, 'A', NULL, NULL, 35)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 9, '3-9', 9, 'mcq', NULL, NULL, 'Right triangles $LMN$ and $PQR$ are similar, where $L$ and $M$ correspond to $P$ and $Q$, respectively. Angle $M$ has a measure of $53°$. What is the measure of angle $Q$ ?', '{"A":"$37°$","B":"$53°$","C":"$127°$","D":"$143°$"}'::jsonb, NULL, 'B', NULL, NULL, 35)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 10, '3-10', 10, 'mcq', NULL, NULL, 'What is the equation of the line that passes through the point $(0, 5)$ and is parallel to the graph of $y = 7x + 4$ in the $xy$-plane?', '{"A":"$y = 5x$","B":"$y = 7x + 5$","C":"$y = 7x$","D":"$y = 5x + 7$"}'::jsonb, NULL, 'B', NULL, NULL, 35)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 11, '3-11', 11, 'mcq', NULL, 'A scatterplot on a coordinate grid with the x-axis labeled from 1 to 10 and the y-axis labeled from 1 to 10 (with 11 marked at top). The plotted points show a decreasing (negative) linear trend: starting near the upper left around (1, 10) and falling to the lower right around (8, 1), with intermediate points roughly at (2, 8), (3, 7), (4, 6), (5, 4), (6, 3).', 'Which of the following equations is the most appropriate linear model for the data shown in the scatterplot?', '{"A":"$y = -1.9x - 10.1$","B":"$y = -1.9x + 10.1$","C":"$y = 1.9x - 10.1$","D":"$y = 1.9x + 10.1$"}'::jsonb, '/data/tests/cb-og-8/figures/m3-q11.png', 'B', NULL, NULL, 36)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 12, '3-12', 12, 'mcq', NULL, NULL, 'A model predicts that the population of Bergen was 15,000 in 2005. The model also predicts that each year for the next 5 years, the population $p$ increased by 4% of the previous year''s population. Which equation best represents this model, where $x$ is the number of years after 2005, for $x \le 5$ ?', '{"A":"$p = 0.96(15{,}000)^x$","B":"$p = 1.04(15{,}000)^x$","C":"$p = 15{,}000(0.96)^x$","D":"$p = 15{,}000(1.04)^x$"}'::jsonb, NULL, 'D', NULL, NULL, 36)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 13, '3-13', 13, 'grid', NULL, NULL, '$2a + 8b = 198$
$2a + 4b = 98$

The solution to the given system of equations is $(a, b)$. What is the value of $b$ ?', NULL, NULL, '25', '["25"]'::jsonb, NULL, 36)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 14, '3-14', 14, 'grid', NULL, NULL, 'The expression $90y^5 - 54y^4$ is equivalent to $ry^4(15y - 9)$, where $r$ is a constant. What is the value of $r$ ?', NULL, NULL, '6', '["6"]'::jsonb, NULL, 36)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 15, '3-15', 15, 'mcq', NULL, 'A coordinate plane with the x-axis labeled from -8 to 8 and the y-axis labeled from about -8 to 16. A cubic curve is shown: it comes up from the lower left, has a local maximum in the second quadrant, dips to a local minimum near the origin region, and then rises again to the upper right. The curve crosses the x-axis at three distinct points.', 'The graph of $y = f(x)$ is shown, where the function $f$ is defined by $f(x) = ax^3 + bx^2 + cx + d$ and $a$, $b$, $c$, and $d$ are constants. For how many values of $x$ does $f(x) = 0$ ?', '{"A":"One","B":"Two","C":"Three","D":"Four"}'::jsonb, '/data/tests/cb-og-8/figures/m3-q15.png', 'C', NULL, NULL, 37)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 16, '3-16', 16, 'mcq', NULL, NULL, 'The area $A$, in square centimeters, of a rectangular cutting board can be represented by the expression $w(w + 9)$, where $w$ is the width, in centimeters, of the cutting board. Which expression represents the length, in centimeters, of the cutting board?', '{"A":"$w(w + 9)$","B":"$w$","C":"$9$","D":"$(w + 9)$"}'::jsonb, NULL, 'D', NULL, NULL, 37)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 17, '3-17', 17, 'mcq', NULL, NULL, '$p = \dfrac{k}{4j + 9}$

The given equation relates the distinct positive numbers $p$, $k$, and $j$. Which equation correctly expresses $4j + 9$ in terms of $p$ and $k$ ?', '{"A":"$4j + 9 = \\dfrac{k}{p}$","B":"$4j + 9 = kp$","C":"$4j + 9 = k - p$","D":"$4j + 9 = \\dfrac{p}{k}$"}'::jsonb, NULL, 'A', NULL, NULL, 37)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 18, '3-18', 18, 'mcq', NULL, NULL, 'Circle A has a radius of $3n$ and circle B has a radius of $129n$, where $n$ is a positive constant. The area of circle B is how many times the area of circle A?', '{"A":"43","B":"86","C":"129","D":"1,849"}'::jsonb, NULL, 'D', NULL, NULL, 37)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 19, '3-19', 19, 'mcq', NULL, NULL, 'The measure of angle $R$ is $\dfrac{2\pi}{3}$ radians. The measure of angle $T$ is $\dfrac{5\pi}{12}$ radians greater than the measure of angle $R$. What is the measure of angle $T$, in degrees?', '{"A":"75","B":"120","C":"195","D":"390"}'::jsonb, NULL, 'C', NULL, NULL, 38)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 20, '3-20', 20, 'grid', NULL, NULL, '$y = x^2 - 14x + 22$

The given equation relates the variables $x$ and $y$. For what value of $x$ does the value of $y$ reach its minimum?', NULL, NULL, '7', '["7"]'::jsonb, NULL, 38)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 21, '3-21', 21, 'grid', NULL, NULL, 'A small business owner budgets $2,200 to purchase candles. The owner must purchase a minimum of 200 candles to maintain the discounted pricing. If the owner pays $4.90 per candle to purchase small candles and $11.60 per candle to purchase large candles, what is the maximum number of large candles the owner can purchase to stay within the budget and maintain the discounted pricing?', NULL, NULL, '182', '["182"]'::jsonb, NULL, 38)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 22, '3-22', 22, 'mcq', NULL, NULL, '$y \le x + 7$
$y \ge -2x - 1$

Which point $(x, y)$ is a solution to the given system of inequalities in the $xy$-plane?', '{"A":"$(-14, 0)$","B":"$(0, -14)$","C":"$(0, 14)$","D":"$(14, 0)$"}'::jsonb, NULL, 'D', NULL, NULL, 38)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 23, '3-23', 23, 'mcq', 'The frequency table summarizes a data set of the weights, rounded to the nearest pound, of 71 tortoises.

Weight (pounds) | Frequency
13 | 12
14 | 8
15 | 5
16 | 7
17 | 9
18 | 10
19 | 13
20 | 7', NULL, 'The frequency table summarizes a data set of the weights, rounded to the nearest pound, of 71 tortoises. A weight of 39 pounds is added to the original data set, creating a new data set of the weights, rounded to the nearest pound, of 72 tortoises. Which statement best compares the mean and median of the new data set to the mean and median of the original data set?', '{"A":"The mean of the new data set is greater than the mean of the original data set, and the median of the new data set is greater than the median of the original data set.","B":"The mean of the new data set is greater than the mean of the original data set, and the medians of the two data sets are equal.","C":"The mean of the new data set is less than the mean of the original data set, and the median of the new data set is less than the median of the original data set.","D":"The mean of the new data set is less than the mean of the original data set, and the medians of the two data sets are equal."}'::jsonb, NULL, 'B', NULL, NULL, 39)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 24, '3-24', 24, 'mcq', NULL, NULL, '$x - 29 = (x - a)(x - 29)$

Which of the following are solutions to the given equation, where $a$ is a constant and $a > 30$ ?

I. $a$
II. $a + 1$
III. $29$', '{"A":"I and II only","B":"I and III only","C":"II and III only","D":"I, II, and III"}'::jsonb, NULL, 'C', NULL, NULL, 39)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 25, '3-25', 25, 'mcq', NULL, NULL, 'In the $xy$-plane, the graph of the equation $y = -x^2 + 9x - 100$ intersects the line $y = c$ at exactly one point. What is the value of $c$?', '{"A":"$-\\dfrac{481}{4}$","B":"$-100$","C":"$-\\dfrac{319}{4}$","D":"$-\\dfrac{9}{2}$"}'::jsonb, NULL, 'C', NULL, NULL, 39)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 26, '3-26', 26, 'mcq', NULL, NULL, 'The functions $f$ and $g$ are defined by the given equations, where $x \ge 0$. Which of the following equations displays, as a constant or coefficient, the maximum value of the function it defines, where $x \ge 0$?

I. $f(x) = 18(1.25)^x + 41$
II. $g(x) = 9(0.73)^x$', '{"A":"I only","B":"II only","C":"I and II","D":"Neither I nor II"}'::jsonb, NULL, 'B', NULL, NULL, 40)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 27, '3-27', 27, 'grid', NULL, NULL, 'The perimeter of an equilateral triangle is 852 centimeters. The three vertices of the triangle lie on a circle. The radius of the circle is $w\sqrt{3}$ centimeters. What is the value of $w$ ?', NULL, NULL, '284/3', '["284/3","94.66","94.67"]'::jsonb, NULL, 40)
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
  VALUES (v_mod, 1, '4-1', 1, 'mcq', NULL, 'A coordinate plane with the $x$-axis (gridlines from about $-8$ to $2$) and the $y$-axis (gridlines from about $-2$ to $10$). A straight line with positive slope rises from lower left to upper right, crossing the $y$-axis at a positive value.', 'What is the $y$-intercept of the line graphed?', '{"A":"$(-5, 0)$","B":"$(0, 0)$","C":"$(0, 5)$","D":"$(0, 9)$"}'::jsonb, '/data/tests/cb-og-8/figures/m4-q1.png', 'C', NULL, NULL, 42)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 2, '4-2', 2, 'mcq', 'For a certain region, the table shows the average number of store employees in 2016 by type of store. (Table — Type of store, Average number of employees: Warehouse store, 365; Department store, 213; Supermarket, 130.)', NULL, 'Based on the table, how much greater was the average number of store employees in warehouse stores than in supermarkets?', '{"A":"83","B":"152","C":"235","D":"495"}'::jsonb, NULL, 'C', NULL, NULL, 42)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 3, '4-3', 3, 'mcq', NULL, 'Two parallel lines $m$ and $n$ (drawn nearly vertical, sloping) are crossed by a transversal line $t$. An angle of $33°$ is marked where $t$ crosses line $m$, and the angle $x°$ is marked at the intersection of $t$ with line $n$. Note: Figure not drawn to scale.', 'In the figure, line $m$ is parallel to line $n$, and line $t$ intersects both lines. What is the value of $x$ ?', '{"A":"33","B":"57","C":"123","D":"147"}'::jsonb, '/data/tests/cb-og-8/figures/m4-q3.png', 'D', NULL, NULL, 42)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 4, '4-4', 4, 'mcq', NULL, NULL, 'Sean rents a tent at a cost of $\$11$ per day plus a onetime insurance fee of $\$10$. Which equation represents the total cost $c$, in dollars, to rent the tent with insurance for $d$ days?', '{"A":"$c = 11(d + 10)$","B":"$c = 10(d + 11)$","C":"$c = 11d + 10$","D":"$c = 10d + 11$"}'::jsonb, NULL, 'C', NULL, NULL, 42)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 5, '4-5', 5, 'mcq', NULL, 'A right triangle with the right angle at the bottom-left vertex. The vertical left leg is labeled $a$, the horizontal bottom leg is labeled $b$, and the hypotenuse (rising from bottom-right to top) is labeled $c$. Note: Figure not drawn to scale.', 'For the right triangle shown, $a = 4$ and $b = 5$. Which expression represents the value of $c$ ?', '{"A":"$4 + 5$","B":"$\\sqrt{(4)(5)}$","C":"$\\sqrt{4 + 5}$","D":"$\\sqrt{4^2 + 5^2}$"}'::jsonb, '/data/tests/cb-og-8/figures/m4-q5.png', 'D', NULL, NULL, 43)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 6, '4-6', 6, 'grid', NULL, NULL, 'The function $g$ is defined by $g(x) = 6x$. For what value of $x$ is $g(x) = 54$ ?', NULL, NULL, '9', '["9"]'::jsonb, NULL, 43)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 7, '4-7', 7, 'grid', NULL, NULL, 'The function $f$ is defined by $f(x) = 8x^3 + 4$. What is the value of $f(2)$ ?', NULL, NULL, '68', '["68"]'::jsonb, NULL, 43)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 8, '4-8', 8, 'mcq', NULL, NULL, 'The function $f$ is defined by $f(x) = \frac{1}{10}x - 2$. What is the $y$-intercept of the graph of $y = f(x)$ in the $xy$-plane?', '{"A":"$(-2, 0)$","B":"$(0, -2)$","C":"$\\left(0, \\frac{1}{10}\\right)$","D":"$\\left(\\frac{1}{10}, 0\\right)$"}'::jsonb, NULL, 'B', NULL, NULL, 43)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 9, '4-9', 9, 'mcq', NULL, NULL, 'A producer is creating a video with a length of 70 minutes. The video will consist of segments that are 1 minute long and segments that are 3 minutes long. Which equation represents this situation, where $x$ represents the number of 1-minute segments and $y$ represents the number of 3-minute segments?', '{"A":"$4xy = 70$","B":"$4(x + y) = 70$","C":"$3x + y = 70$","D":"$x + 3y = 70$"}'::jsonb, NULL, 'D', NULL, NULL, 43)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 10, '4-10', 10, 'mcq', NULL, NULL, 'The function $f$ is defined by $f(x) = 7x^3$. In the $xy$-plane, the graph of $y = g(x)$ is the result of shifting the graph of $y = f(x)$ down 2 units. Which equation defines function $g$ ?', '{"A":"$g(x) = \\frac{7}{2}x^3$","B":"$g(x) = 7x^{\\frac{3}{2}}$","C":"$g(x) = 7x^3 + 2$","D":"$g(x) = 7x^3 - 2$"}'::jsonb, NULL, 'D', NULL, NULL, 44)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 11, '4-11', 11, 'mcq', '$y = -3x$
$4x + y = 15$', NULL, 'The solution to the given system of equations is $(x, y)$. What is the value of $x$ ?', '{"A":"1","B":"5","C":"15","D":"45"}'::jsonb, NULL, 'C', NULL, NULL, 44)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 12, '4-12', 12, 'mcq', NULL, 'A right triangle with vertices $B$ (top), $C$ (bottom-left, right angle), and $A$ (bottom-right). The vertical leg $BC$ is labeled $35$, and the hypotenuse $BA$ is labeled $171$. Note: Figure not drawn to scale.', 'In the right triangle shown, what is the value of $\sin A$ ?', '{"A":"$\\frac{1}{171}$","B":"$\\frac{35}{171}$","C":"$\\frac{171}{35}$","D":"$171$"}'::jsonb, '/data/tests/cb-og-8/figures/m4-q12.png', 'B', NULL, NULL, 44)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 13, '4-13', 13, 'grid', NULL, NULL, 'What is the area, in square centimeters, of a rectangle with a length of 34 centimeters (cm) and a width of 29 cm?', NULL, NULL, '986', '["986"]'::jsonb, NULL, 44)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 14, '4-14', 14, 'grid', NULL, NULL, 'If $\frac{x}{y} = 4$ and $\frac{24x}{ny} = 4$, what is the value of $n$ ?', NULL, NULL, '24', '["24"]'::jsonb, NULL, 45)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 15, '4-15', 15, 'mcq', NULL, NULL, 'A bowl contains 20 ounces of water. When the bowl is uncovered, the amount of water in the bowl decreases by 1 ounce every 4 days. If 9 ounces of water remain in this bowl, for how many days has it been uncovered?', '{"A":"3","B":"7","C":"36","D":"44"}'::jsonb, NULL, 'D', NULL, NULL, 45)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 16, '4-16', 16, 'mcq', NULL, NULL, 'If $9(4 - 3x) + 2 = 8(4 - 3x) + 18$, what is the value of $4 - 3x$ ?', '{"A":"$-16$","B":"$-4$","C":"$4$","D":"$16$"}'::jsonb, NULL, 'D', NULL, NULL, 45)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 17, '4-17', 17, 'mcq', NULL, NULL, 'A certain township consists of a 5-hectare industrial park and a 24-hectare neighborhood. The total number of trees in the township is 4,529. The equation $5x + 24y = 4{,}529$ represents this situation. Which of the following is the best interpretation of $x$ in this context?', '{"A":"The average number of trees per hectare in the industrial park","B":"The average number of trees per hectare in the neighborhood","C":"The total number of trees in the industrial park","D":"The total number of trees in the neighborhood"}'::jsonb, NULL, 'A', NULL, NULL, 45)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 18, '4-18', 18, 'mcq', NULL, NULL, 'Which expression is equivalent to $a^{\frac{11}{12}}$, where $a > 0$ ?', '{"A":"$\\sqrt[12]{a^{132}}$","B":"$\\sqrt[144]{a^{132}}$","C":"$\\sqrt[121]{a^{132}}$","D":"$\\sqrt[11]{a^{132}}$"}'::jsonb, NULL, 'B', NULL, NULL, 45)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 19, '4-19', 19, 'mcq', 'The dot plots represent the distributions of values in data sets A and B.', 'Two dot plots labeled "Data Set A" and "Data Set B", each with a number-line axis labeled "Value" marked from 10 to 16. Data Set A''s dots are clustered toward the lower-middle values; Data Set B''s dots are spread more widely across the range. Both distributions appear centered around the same median value.', 'Which of the following statements must be true?
I. The median of data set A is equal to the median of data set B.
II. The standard deviation of data set A is equal to the standard deviation of data set B.', '{"A":"I only","B":"II only","C":"I and II","D":"Neither I nor II"}'::jsonb, '/data/tests/cb-og-8/figures/m4-q19.png', 'A', NULL, NULL, 46)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 20, '4-20', 20, 'grid', NULL, NULL, 'A circle has center $O$, and points $R$ and $S$ lie on the circle. In triangle $ORS$, the measure of $\angle ROS$ is $88°$. What is the measure of $\angle RSO$, in degrees? (Disregard the degree symbol when entering your answer.)', NULL, NULL, '46', '["46"]'::jsonb, NULL, 46)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 21, '4-21', 21, 'grid', NULL, NULL, 'The regular price of a shirt at a store is $\$11.70$. The sale price of the shirt is 80% less than the regular price, and the sale price is 30% greater than the store''s cost for the shirt. What was the store''s cost, in dollars, for the shirt? (Disregard the $\$$ sign when entering your answer. For example, if your answer is $\$4.97$, enter 4.97)', NULL, NULL, '1.8', '["1.8","9/5"]'::jsonb, NULL, 46)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 22, '4-22', 22, 'mcq', NULL, NULL, 'A cube has an edge length of 68 inches. A solid sphere with a radius of 34 inches is inside the cube, such that the sphere touches the center of each face of the cube. To the nearest cubic inch, what is the volume of the space in the cube not taken up by the sphere?', '{"A":"149,796","B":"164,500","C":"190,955","D":"310,800"}'::jsonb, NULL, 'A', NULL, NULL, 46)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 23, '4-23', 23, 'mcq', '$y = 6x + 18$', NULL, 'One of the equations in a system of two linear equations is given. The system has no solution. Which equation could be the second equation in the system?', '{"A":"$-6x + y = 18$","B":"$-6x + y = 22$","C":"$-12x + y = 36$","D":"$-12x + y = 18$"}'::jsonb, NULL, 'B', NULL, NULL, 47)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 24, '4-24', 24, 'mcq', NULL, NULL, 'Triangles $PQR$ and $LMN$ are graphed in the $xy$-plane. Triangle $PQR$ has vertices $P$, $Q$, and $R$ at $(4, 5)$, $(4, 7)$, and $(6, 5)$, respectively. Triangle $LMN$ has vertices $L$, $M$, and $N$ at $(4, 5)$, $(4, 7 + k)$, and $(6 + k, 5)$, respectively, where $k$ is a positive constant. If the measure of $\angle Q$ is $t°$, what is the measure of $\angle N$ ?', '{"A":"$(90 - (t - k))°$","B":"$(90 - (t + k))°$","C":"$(90 - t)°$","D":"$(90 + k)°$"}'::jsonb, NULL, 'C', NULL, NULL, 47)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 25, '4-25', 25, 'mcq', '$2x + 3y = 7$
$10x + 15y = 35$', NULL, 'For each real number $r$, which of the following points lies on the graph of each equation in the $xy$-plane for the given system?', '{"A":"$\\left(\\frac{r}{5} + 7, -\\frac{r}{5} + 35\\right)$","B":"$\\left(-\\frac{3r}{2} + \\frac{7}{2}, r\\right)$","C":"$\\left(r, \\frac{2r}{3} + \\frac{7}{3}\\right)$","D":"$\\left(r, -\\frac{3r}{2} + \\frac{7}{2}\\right)$"}'::jsonb, NULL, 'B', NULL, NULL, 47)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 26, '4-26', 26, 'mcq', '$\frac{x^2}{\sqrt{x^2 - c^2}} = \frac{c^2}{\sqrt{x^2 - c^2}} + 39$', NULL, 'In the given equation, $c$ is a positive constant. Which of the following is one of the solutions to the given equation?', '{"A":"$-c$","B":"$-c^2 - 39^2$","C":"$-\\sqrt{39^2 - c^2}$","D":"$-\\sqrt{c^2 + 39^2}$"}'::jsonb, NULL, 'D', NULL, NULL, 48)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 27, '4-27', 27, 'grid', NULL, NULL, 'The quadratic function $g$ models the depth, in meters, below the surface of the water of a seal $t$ minutes after the seal entered the water during a dive. The function estimates that the seal reached its maximum depth of 302.4 meters 6 minutes after it entered the water and then reached the surface of the water 12 minutes after it entered the water. Based on the function, what was the estimated depth, to the nearest meter, of the seal 10 minutes after it entered the water?', NULL, NULL, '168', '["168"]'::jsonb, NULL, 48)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
END $seed$;
