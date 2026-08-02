package com.wombat.split.jobs

/**
 * Auto-naming pool for split jobs.
 *
 * "wombat" is deliberately not in the pool — it's the app's name, not a job
 * name. The pool starts at echidna and sticks to the same burrowing-marsupial
 * neighbourhood.
 */
object JobNames {

    val pool: List<String> = listOf(
        "echidna",
        "quokka",
        "numbat",
        "bilby",
        "quoll",
        "bandicoot",
        "bettong",
        "potoroo",
        "pademelon",
        "dunnart",
        "antechinus",
        "wallaby",
        "possum",
        "glider",
        "koala",
        "kowari",
        "mulgara",
        "dibbler",
        "cuscus",
        "kangaroo",
    )

    /**
     * Name for the [index]-th job ever created (0-based). Cycles through the
     * pool in order; after a full lap, names get a round suffix:
     * echidna, quokka, …, kangaroo, echidna-2, quokka-2, …
     */
    fun nameFor(index: Int): String {
        require(index >= 0) { "index must be >= 0, was $index" }
        val animal = pool[index % pool.size]
        val round = index / pool.size
        return if (round == 0) animal else "$animal-${round + 1}"
    }

    /** First generated name not already present in [existing]. */
    fun next(existing: Collection<String>): String {
        val taken = existing.toHashSet()
        var index = 0
        while (true) {
            val candidate = nameFor(index)
            if (candidate !in taken) return candidate
            index++
        }
    }
}
